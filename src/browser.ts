import { chromium, type Browser, type Page, type BrowserContext } from "playwright"
import { mkdir } from "node:fs/promises"
import type { Action, PageState, AgentConfig } from "./types"

const START_URL = "https://html.duckduckgo.com/html/"

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

  async close(): Promise<string | null> {
    let videoPath: string | null = null
    
    try {
      if (this.page && this.config.recordVideo) {
        // wait a bit for video to have some frames
        await this.page.waitForTimeout(1000)
        
        const video = this.page.video()
        if (video) {
          // close page first - this finalizes the video
          await this.page.close()
          this.page = null
          
          // ensure dir exists
          await mkdir("./traw-recordings", { recursive: true })
          
          // save video
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

    const url = this.page.url()
    const title = await this.page.title()
    const dom = await this.getSimplifiedDom()

    return { url, title, dom }
  }

  // get simplified DOM - only interactive elements with valid selectors
  private async getSimplifiedDom(): Promise<string> {
    if (!this.page) return ""

    return await this.page.evaluate(() => {
      const selectors = ["a", "button", "input", "textarea", "select", "[role='button']", "[type='submit']"]
      const elements: string[] = []
      let idx = 0
      
      selectors.forEach(sel => {
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
          
          // build valid css selector - try multiple strategies
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
            const cls = el.className.split(" ").filter(c => c && !c.includes(":"))[0]
            if (cls) selector = `${tag}.${cls}`
          }
          
          // fallback: use nth-of-type
          if (!selector && (tag === "button" || tag === "a")) {
            const siblings = Array.from(document.querySelectorAll(tag))
            const index = siblings.findIndex(s => s === el) + 1
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
          idx++
        })
      })

      // dedupe and limit
      return [...new Set(elements)].slice(0, 60).join("\n")
    })
  }

  async execute(action: Action): Promise<string> {
    if (!this.page) throw new Error("browser not launched")

    try {
      switch (action.type) {
        case "goto":
          await this.page.goto(action.text!, { waitUntil: "networkidle", timeout: 15000 })
          return `navigated to ${action.text}`

        case "click":
          await this.page.click(action.selector!, { timeout: 10000 })
          await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
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
    return await this.page.screenshot()
  }
}
