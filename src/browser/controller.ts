import { firefox, type Browser, type Page, type BrowserContext } from "playwright"
import { mkdir } from "node:fs/promises"
import { Readability } from "@mozilla/readability"
import TurndownService from "turndown"
import { parseHTML } from "linkedom"
import type { Action, PageState, AgentConfig } from "../types"

export class BrowserController {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.config = config
  }

  async launch(): Promise<void> {
    this.browser = await firefox.launch({
      headless: this.config.headless,
    })

    const contextOpts: any = {
      viewport: { width: 1280, height: 720 },
      locale: "en-US",
      timezoneId: "Europe/Moscow",
    }

    if (this.config.recordVideo) {
      contextOpts.recordVideo = {
        dir: "./traw-recordings",
        size: { width: 1280, height: 720 },
      }
    }

    this.context = await this.browser.newContext(contextOpts)
    this.page = await this.context.newPage()
  }

  private async waitForContent(): Promise<void> {
    if (!this.page) return

    try {
      await Promise.race([
        this.page.waitForLoadState("networkidle", { timeout: 5000 }),
        new Promise((r) => setTimeout(r, 3000)),
      ])
      await this.page.waitForTimeout(200)
    } catch {
      // ignore, page might be simple html
    }
  }

  async close(): Promise<string | null> {
    let videoPath: string | null = null

    try {
      if (this.page && this.config.recordVideo) {
        await this.page.waitForTimeout(1000)

        const video = this.page.video()
        if (video) {
          await this.page.close()
          this.page = null

          await mkdir("./traw-recordings", { recursive: true })

          const filename = `traw-${Date.now()}.webm`
          const savePath = `./traw-recordings/${filename}`

          await video.saveAs(savePath)
          videoPath = savePath
        }
      }
    } catch (e: any) {
      console.error("[video error]", e.message)
    }

    if (this.page) await this.page.close().catch(() => {})
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})

    return videoPath
  }

  async getState(includeScreenshot = false): Promise<PageState> {
    if (!this.page) throw new Error("browser not launched")

    await this.waitForContent()

    const url = this.page.url()
    const title = await this.page.title()
    const dom = await this.extractDom()
    const markdown = await this.extractMarkdown()

    let screenshot: string | undefined
    if (includeScreenshot) {
      const buf = await this.page.screenshot({ type: "jpeg", quality: 80 })
      screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`
    }

    return { url, title, dom, content: markdown, screenshot }
  }

  async execute(action: Action): Promise<string> {
    if (!this.page) throw new Error("browser not launched")

    try {
      switch (action.type) {
        case "goto":
          await this.page.goto(action.text!, { waitUntil: "domcontentloaded", timeout: 15000 })
          await this.waitForContent()
          return `navigated to ${action.text}`

        case "click":
          await this.page.click(action.selector!, { timeout: 5000 })
          await this.page.waitForTimeout(300)
          return `clicked ${action.selector}`

        case "type":
          await this.page.fill(action.selector!, action.text!)
          return `typed "${action.text}" into ${action.selector}`

        case "scroll":
          const delta = action.direction === "down" ? 500 : -500
          await this.page.mouse.wheel(0, delta)
          await this.page.waitForTimeout(300)
          return `scrolled ${action.direction}`

        case "wait":
          await this.page.waitForTimeout(2000)
          return "waited 2s"

        case "screenshot":
          const buf = await this.page.screenshot()
          return `screenshot taken (${buf.length} bytes)`

        case "done":
          return "agent finished"

        default:
          return `unknown action: ${action.type}`
      }
    } catch (err: any) {
      return `error: ${err.message}`
    }
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page) throw new Error("browser not launched")
    return this.page.screenshot()
  }

  private async extractMarkdown(): Promise<string> {
    if (!this.page) return ""

    const html = await this.page.content()

    try {
      const { document } = parseHTML(html)

      // readability extracts main content, strips ads/nav/footer
      const reader = new Readability(document as any)
      const article = reader.parse()

      if (!article?.content) {
        // fallback: just get body text
        return document.body?.textContent?.slice(0, 5000) || ""
      }

      // convert clean html to markdown
      const turndown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      })

      const md = turndown.turndown(article.content)

      // trim if too long
      if (md.length > 8000) {
        return md.slice(0, 8000) + "\n\n[content truncated...]"
      }

      return md
    } catch {
      // fallback on parse error
      const text = await this.page.evaluate(() => document.body?.innerText || "")
      return text.slice(0, 5000)
    }
  }

  private async extractDom(): Promise<string> {
    if (!this.page) return ""

    return this.page.evaluate(() => {
      const selectors = [
        "a",
        "button",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[type='submit']",
      ]
      const elements: string[] = []

      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          const tag = el.tagName.toLowerCase()
          const text = (el as HTMLElement).innerText?.slice(0, 40)?.trim() || ""
          const href = (el as HTMLAnchorElement).href || ""
          const placeholder = (el as HTMLInputElement).placeholder || ""
          const type = (el as HTMLInputElement).type || ""
          const name = (el as HTMLInputElement).name || ""
          const value = (el as HTMLInputElement).value || ""
          const title = el.getAttribute("title") || ""
          const ariaLabel = el.getAttribute("aria-label") || ""

          let selector = ""

          if (el.id) {
            selector = `#${el.id}`
          } else if (name) {
            selector = `${tag}[name="${name}"]`
          } else if (title) {
            selector = `${tag}[title="${title}"]`
          } else if (ariaLabel) {
            selector = `${tag}[aria-label="${ariaLabel}"]`
          } else if (type && tag === "input") {
            selector = `input[type="${type}"]`
          } else if (el.className && typeof el.className === "string") {
            const cls = el.className.split(" ").filter((c) => c && !c.includes(":"))[0]
            if (cls) selector = `${tag}.${cls}`
          }

          if (!selector && (tag === "button" || tag === "a")) {
            const siblings = Array.from(document.querySelectorAll(tag))
            const index = siblings.findIndex((s) => s === el) + 1
            if (index > 0) selector = `${tag}:nth-of-type(${index})`
          }

          if (!selector) return

          let desc = `[${selector}]`
          if (text) desc += ` "${text}"`
          if (value && !text) desc += ` value="${value}"`
          if (href && !href.startsWith("javascript:")) desc += ` -> ${href.slice(0, 50)}`
          if (placeholder) desc += ` placeholder="${placeholder}"`
          if (title && !text) desc += ` title="${title}"`
          if (ariaLabel && !text && !title) desc += ` aria="${ariaLabel}"`
          if (type && type !== "submit" && type !== "text") desc += ` type=${type}`

          elements.push(desc)
        })
      })

      return [...new Set(elements)].join("\n")
    })
  }
}
