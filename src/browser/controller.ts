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

    const pageText = await this.page.evaluate(() => {
      const texts: string[] = []
      const textSelector = "h1, h2, h3, h4, h5, h6, p, li, blockquote, td, th, figcaption, summary"
      
      document.querySelectorAll(textSelector).forEach((el) => {
        const node = el as HTMLElement
        if (node.offsetParent === null) return
        
        const text = node.innerText?.trim()
        if (!text || text.length < 3) return
        
        const tag = el.tagName.toLowerCase()
        const prefix = tag.startsWith("h") ? `[${tag}]` : ""
        texts.push(`${prefix} ${text}`)
      })
      
      const unique = [...new Set(texts)]
      return unique.join("\n")
    }).catch(() => "")

    const elements = await this.page.evaluate(() => {
      const items: string[] = []
      const selector = 'a[href], button, input, textarea, select, [role="button"], [onclick]'
      
      document.querySelectorAll(selector).forEach((el) => {
        const node = el as HTMLElement
        if (node.offsetParent === null) return
        
        const tag = el.tagName.toLowerCase()
        const type = (el as HTMLInputElement).type || ""
        const text = el.textContent?.trim() || ""
        const val = (el as HTMLInputElement).value || ""
        const name = (el as HTMLInputElement).name || ""
        const placeholder = (el as HTMLInputElement).placeholder || ""
        
        const ariaLabel = el.getAttribute("aria-label") || ""
        const titleAttr = el.getAttribute("title") || ""
        const alt = (el as HTMLImageElement).alt || ""
        
        let linkedLabel = ""
        const id = el.id
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`)
          if (labelEl) linkedLabel = labelEl.textContent?.trim() || ""
        }
        
        const displayText = ariaLabel || titleAttr || alt || linkedLabel || text || placeholder || name
        
        let label = ""
        if (tag === "a") {
          label = `<a>${displayText}</a>`
        } else if (tag === "button") {
          label = `<button>${displayText || val}</button>`
        } else if (tag === "input" && (type === "submit" || type === "button")) {
          label = `<button>${val || displayText}</button>`
        } else if (tag === "input") {
          const labelPart = linkedLabel ? ` label="${linkedLabel}"` : ""
          label = `<input${type ? ` type="${type}"` : ""}${labelPart}${val ? ` value="${val}"` : ""}>`
        } else if (tag === "textarea") {
          const labelPart = linkedLabel ? ` label="${linkedLabel}"` : ""
          label = `<textarea${labelPart}>${val}</textarea>`
        } else if (tag === "select") {
          const labelPart = linkedLabel ? ` label="${linkedLabel}"` : ""
          const selected = (el as HTMLSelectElement).selectedOptions[0]?.text || ""
          label = `<select${labelPart}${selected ? ` selected="${selected}"` : ""}>`
        } else {
          label = `<${tag}>${displayText}</${tag}>`
        }
        
        node.setAttribute("data-idx", String(items.length))
        items.push(`[${items.length}] ${label}`)
      })
      
      return items.join("\n")
    }).catch(() => "")
    
    const combined = [pageText, elements].filter(Boolean).join("\n\n")

    return {
      url,
      title,
      text: combined,
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
