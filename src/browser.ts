import { chromium, type Browser, type Page, type BrowserContext } from "playwright"
import { mkdir } from "node:fs/promises"
import type { Action, PageState, AgentConfig } from "./types"

export class BrowserController {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.config = config
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    })

    const contextOpts: any = {
      viewport: { width: 1280, height: 720 },
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

  // wait for page to be fully loaded (including JS content)
  private async waitForContent(): Promise<void> {
    if (!this.page) return

    try {
      // wait for network to be idle
      await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})

      // wait for DOM content
      await this.page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {})

      // extra wait for JS frameworks to render
      await this.page.waitForTimeout(800)

      // wait for body to have content
      await this.page.waitForFunction(
        () => document.body && document.body.innerText.length > 100,
        { timeout: 5000 }
      ).catch(() => {})
    } catch {
      // ignore timeout errors, page might be simple html
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

  async getState(): Promise<PageState> {
    if (!this.page) throw new Error("browser not launched")

    // wait for dynamic content to load
    await this.waitForContent()

    const url = this.page.url()
    const title = await this.page.title()
    const content = await this.extractContent()
    const dom = await this.extractDom()

    return { url, title, dom, content }
  }

  async execute(action: Action): Promise<string> {
    if (!this.page) throw new Error("browser not launched")

    try {
      switch (action.type) {
        case "goto":
          await this.page.goto(action.text!, { waitUntil: "domcontentloaded", timeout: 20000 })
          await this.waitForContent()
          return `navigated to ${action.text}`

        case "click":
          await this.page.click(action.selector!, { timeout: 10000 })
          await this.waitForContent()
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

  // extract readable text content from page
  private async extractContent(): Promise<string> {
    if (!this.page) return ""

    return this.page.evaluate(() => {
      const sections: string[] = []

      // get meta description
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc) {
        const content = metaDesc.getAttribute("content")
        if (content) sections.push(`[meta] ${content}`)
      }

      // get main headings with their content
      const mainContent = document.querySelector("main, article, .content, #content, [role='main']") || document.body

      // extract headings hierarchy
      const headings = mainContent.querySelectorAll("h1, h2, h3")
      headings.forEach((h) => {
        const text = (h as HTMLElement).innerText?.trim()
        if (text && text.length < 200) {
          const level = h.tagName.toLowerCase()
          sections.push(`[${level}] ${text}`)
        }
      })

      // extract paragraphs (first 10)
      const paragraphs = mainContent.querySelectorAll("p")
      let pCount = 0
      paragraphs.forEach((p) => {
        if (pCount >= 10) return
        const text = (p as HTMLElement).innerText?.trim()
        if (text && text.length > 30 && text.length < 500) {
          sections.push(text)
          pCount++
        }
      })

      // extract list items (first 15)
      const listItems = mainContent.querySelectorAll("li")
      let liCount = 0
      listItems.forEach((li) => {
        if (liCount >= 15) return
        const text = (li as HTMLElement).innerText?.trim()
        if (text && text.length > 10 && text.length < 200) {
          // skip if it's just a nav item
          if (!li.closest("nav, header, footer")) {
            sections.push(`• ${text}`)
            liCount++
          }
        }
      })

      // extract code blocks (first 3)
      const codeBlocks = mainContent.querySelectorAll("pre code, pre")
      let codeCount = 0
      codeBlocks.forEach((code) => {
        if (codeCount >= 3) return
        const text = (code as HTMLElement).innerText?.trim()
        if (text && text.length > 20 && text.length < 300) {
          sections.push(`[code] ${text.slice(0, 200)}`)
          codeCount++
        }
      })

      // dedupe and limit total length
      const unique = [...new Set(sections)]
      const result = unique.join("\n\n")

      // cap at ~4000 chars to not overwhelm the LLM
      return result.length > 4000 ? result.slice(0, 4000) + "\n[...truncated]" : result
    })
  }

  // extract only interactive elements with valid css selectors
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

          // build css selector - try multiple strategies
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

          // fallback: nth-of-type
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

      // dedupe and limit
      return [...new Set(elements)].slice(0, 60).join("\n")
    })
  }
}
