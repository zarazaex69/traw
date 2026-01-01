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

  async getState(includeScreenshot = false): Promise<PageState> {
    if (!this.page) throw new Error("browser not launched")

    await this.page.waitForLoadState("domcontentloaded").catch(() => {})

    const url = this.page.url()
    const title = await this.page.title()

    const pageText = await this.page.evaluate(() => {
      const texts: string[] = []
      const textSelector = "h1, h2, h3, h4, h5, h6, p, li, blockquote, td, th, figcaption, summary"
      
      document.querySelectorAll(textSelector).forEach((el) => {
        const node = el as HTMLElement
        if (node.offsetParent === null) return // skip hidden
        
        const text = node.innerText?.trim()
        if (!text || text.length < 3) return
        
        const tag = el.tagName.toLowerCase()
        const prefix = tag.startsWith("h") ? `[${tag}]` : ""
        texts.push(`${prefix} ${text.slice(0, 200)}`)
      })
      
      // dedupe and limit
      const unique = [...new Set(texts)]
      return unique.slice(0, 30).join("\n")
    }).catch(() => "")

    const elements = await this.page.evaluate(() => {
      const items: string[] = []
      const selector = 'a[href], button, input, textarea, select, [role="button"], [onclick]'
      
      document.querySelectorAll(selector).forEach((el) => {
        const node = el as HTMLElement
        if (node.offsetParent === null) return // skip hidden
        
        const tag = el.tagName.toLowerCase()
        const type = (el as HTMLInputElement).type || ""
        const text = el.textContent?.trim().slice(0, 40) || ""
        const val = (el as HTMLInputElement).value || ""
        const name = (el as HTMLInputElement).name || (el as HTMLInputElement).placeholder || ""
        
        let label = ""
        if (tag === "a") label = `<a>${text}</a>`
        else if (tag === "button") label = `<button>${text || val}</button>`
        else if (tag === "input" && (type === "submit" || type === "button")) label = `<button>${val || text}</button>`
        else if (tag === "input") label = `<input${type ? ` type="${type}"` : ""}${name ? ` name="${name}"` : ""}${val ? ` value="${val}"` : ""}>`
        else if (tag === "textarea") label = `<textarea${name ? ` name="${name}"` : ""}>${val.slice(0, 20)}</textarea>`
        else if (tag === "select") label = `<select${name ? ` name="${name}"` : ""}>`
        else label = `<${tag}>${text.slice(0, 20)}</${tag}>`
        
        node.setAttribute("data-idx", String(items.length))
        items.push(`[${items.length}] ${label}`)
      })
      
      return items.join("\n")
    }).catch(() => "")
    
    // combine text + interactive elements
    const combined = [pageText, elements].filter(Boolean).join("\n\n")

    let screenshot: string | undefined
    if (includeScreenshot) {
      const buf = await this.page.screenshot({ type: "jpeg", quality: 80 })
      screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`
    }

    return {
      url,
      title,
      text: combined,
      screenshot,
    }
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
