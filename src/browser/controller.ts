import { firefox, type Browser, type Page, type BrowserContext } from "playwright"
import { mkdir } from "node:fs/promises"
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

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: "en-US",
      timezoneId: "Europe/Moscow",
      ...(this.config.recordVideo && {
        recordVideo: {
          dir: "./traw-recordings",
          size: { width: 1280, height: 720 },
        },
      }),
    })
    this.page = await this.context.newPage()
  }

  async close(): Promise<string | null> {
    let videoPath: string | null = null

    if (this.page && this.config.recordVideo) {
      try {
        const video = this.page.video()
        if (video) {
          await this.page.close()
          this.page = null
          await mkdir("./traw-recordings", { recursive: true })
          const savePath = `./traw-recordings/traw-${Date.now()}.webm`
          await video.saveAs(savePath)
          videoPath = savePath
        }
      } catch (e: any) {
        console.error("[video error]", e.message)
      }
    }

    if (this.page) await this.page.close().catch(() => {})
    if (this.context) await this.context.close().catch(() => {})
    if (this.browser) await this.browser.close().catch(() => {})

    return videoPath
  }

  async getState(): Promise<PageState> {
    if (!this.page) throw new Error("browser not launched")

    await this.page.waitForLoadState("domcontentloaded").catch(() => {})

    const url = this.page.url()
    const title = await this.page.title()

    const xml = await this.page.evaluate(() => {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      const out: string[] = ["<page>"]
      let idx = 0

      document.querySelectorAll("[data-idx]").forEach(el => el.removeAttribute("data-idx"))

      const skipTags = new Set(["script", "style", "noscript", "svg", "path", "meta", "link", "br", "hr"])
      const interactiveTags = new Set(["a", "button", "input", "textarea", "select"])
      const textTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "td", "th", "label"])

      const getAttrs = (el: HTMLElement, tag: string, idx: number): string[] => {
        const attrs: string[] = [`id="${idx}"`]
        const input = el as HTMLInputElement
        const anchor = el as HTMLAnchorElement

        if (input.type) attrs.push(`type="${input.type}"`)
        if (tag === "a" && anchor.href) attrs.push(`href="${esc(anchor.href.slice(0, 80))}"`)
        if (input.value) attrs.push(`value="${esc(input.value)}"`)
        if ((el as any).disabled) attrs.push(`disabled="true"`)
        if ((el as any).checked) attrs.push(`checked="true"`)
        if ((el as any).readOnly) attrs.push(`readonly="true"`)
        if ((el as any).required) attrs.push(`required="true"`)
        if (el.getAttribute("aria-expanded")) attrs.push(`expanded="${el.getAttribute("aria-expanded")}"`)
        if (el.getAttribute("aria-selected") === "true") attrs.push(`selected="true"`)

        return attrs
      }

      const walk = (node: Element, depth: number) => {
        const el = node as HTMLElement
        const tag = el.tagName.toLowerCase()
        const indent = "  ".repeat(depth)

        if (skipTags.has(tag)) return

        const isInteractive = interactiveTags.has(tag) || el.getAttribute("role") || el.hasAttribute("onclick")

        if (isInteractive) {
          el.setAttribute("data-idx", String(idx))
          const attrs = getAttrs(el, tag, idx)
          const text = el.textContent?.trim() || ""
          const label = esc(el.getAttribute("aria-label") || text || (el as HTMLInputElement).placeholder || "")
          out.push(`${indent}<${tag} ${attrs.join(" ")}>${label}</${tag}>`)
          idx++
        } else if (textTags.has(tag)) {
          const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent?.trim())
            .join(" ")
            .trim()

          if (directText.length > 2) {
            out.push(`${indent}<${tag}>${esc(directText)}</${tag}>`)
          }
        }

        Array.from(el.children).forEach(child => walk(child, depth + 1))
      }

      walk(document.body, 0)
      out.push("</page>")
      return out.join("\n")
    }).catch(() => "<page></page>")

    return { url, title, text: xml }
  }

  async execute(action: Action): Promise<string> {
    if (!this.page) throw new Error("browser not launched")

    try {
      switch (action.type) {
        case "goto":
          await this.page.goto(action.text!, { waitUntil: "domcontentloaded", timeout: 15000 })
          return `navigated to ${action.text}`

        case "click":
          const clickEl = this.page.locator(`[data-idx="${action.index}"]`)
          await clickEl.click({ timeout: 5000 })
          return `clicked [${action.index}]`

        case "type":
          const typeEl = this.page.locator(`[data-idx="${action.index}"]`)
          await typeEl.fill(action.text!)
          await this.page.waitForTimeout(300)
          return `typed "${action.text}" into [${action.index}]`

        case "scroll":
          const delta = action.direction === "down" ? 500 : -500
          await this.page.mouse.wheel(0, delta)
          return `scrolled ${action.direction}`

        case "wait":
          await this.page.waitForTimeout(2000)
          return "waited 2s"

        case "back":
          await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 })
          return "went back"

        case "done":
          return "done"

        default:
          return `unknown action: ${action.type}`
      }
    } catch (err: any) {
      return `error: ${err.message}`
    }
  }
}
