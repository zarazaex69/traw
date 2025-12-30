// minimal cli output with unicode symbols
import { markdown } from "markdownly.js"

function renderMd(text: string): string {
  try {
    return markdown(text).trim()
  } catch {
    return text
  }
}

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
}

const icons = {
  arrow: "→",
  check: "✓",
  cross: "✗",
  dot: "(0)",
  circle: "○",
  brain: "!",
  play: ">",
}

class Spinner {
  private frames = [".", "..", "..."]
  private idx = 0
  private interval: ReturnType<typeof setInterval> | null = null
  private label: string

  constructor(label: string) {
    this.label = label
  }

  start() {
    process.stdout.write("\x1b[?25l")
    process.stdout.write(`  ${c.dim}${this.label}...${c.reset}`)
    this.interval = setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length
      process.stdout.write(`\r\x1b[K  ${c.dim}${this.label}${this.frames[this.idx]}${c.reset}`)
    }, 250)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write(`\r\x1b[K`)
    process.stdout.write("\x1b[?25h")
  }
}

let loadSpinner: Spinner | null = null
let receiveSpinner: Spinner | null = null
let openSpinner: Spinner | null = null

export const log = {
  header: (goal: string) => {
    console.log()
    console.log(`${c.yellow}${icons.play}${c.reset} ${goal}`)
    console.log()
  },

  config: (opts: { mo: string; model: string; headless: boolean; video: boolean; vision: boolean; steps: number }) => {
    const parts = [
      `${c.dim}${opts.model}${c.reset}`,
      opts.headless ? `${c.dim}headless${c.reset}` : null,
      opts.video ? `${c.dim}video${c.reset}` : null,
      opts.vision ? `${c.dim}vision${c.reset}` : null,
      `${c.dim}steps:${c.reset} ${opts.steps}`,
    ].filter(Boolean)
    console.log(`  ${parts.join("  ")}`)
    console.log()
  },

  plan: (text: string) => {
    console.log(renderMd(text))
    console.log()
  },

  step: (n: number, total: number, url: string) => {
    const shortUrl = url.length > 50 ? url.slice(0, 47) + "..." : url
    console.log(`${c.magenta}${icons.dot}${c.reset} ${c.bold}${n}/${total}${c.reset} ${c.dim}${shortUrl}${c.reset}`)
  },

  thought: (msg: string) => {
    const short = msg.length > 80 ? msg.slice(0, 77) + "..." : msg
    console.log(`  ${c.bold}${c.yellow}${icons.brain}${c.reset} ${c.gray}${short}${c.reset}`)
  },

  action: (type: string, target?: string) => {
    const t = target ? ` ${c.dim}${target}${c.reset}` : ""
    console.log(`  ${c.blue}${icons.arrow}${c.reset} ${type}${t}`)
  },

  ok: (msg?: string) => {
    if (msg) {
      const short = msg.length > 60 ? msg.slice(0, 57) + "..." : msg
      console.log(`  ${c.green}${icons.check}${c.reset} ${c.dim}${short}${c.reset}`)
    }
  },

  fail: (msg: string) => {
    const short = msg.length > 60 ? msg.slice(0, 57) + "..." : msg
    console.log(`  ${c.red}${icons.cross}${c.reset} ${short}`)
  },

  done: (steps: number, reason?: string) => {
    console.log()
    console.log(`${c.green}${icons.check} done${c.reset} ${c.dim}in ${steps} steps${c.reset}`)
    if (reason) {
      console.log()
      console.log(renderMd(reason))
    }
  },

  stats: (totalMs: number, aiMs: number, browserMs: number) => {
    const fmt = (ms: number) => (ms / 1000).toFixed(1) + "s"
    console.log()
    console.log(`${c.dim}total:${c.reset}   ${fmt(totalMs)}`)
    console.log(`${c.dim}neuro:${c.reset}      ${fmt(aiMs)} ${c.dim}(${Math.round(aiMs / totalMs * 100)}%)${c.reset}`)
    console.log(`${c.dim}browser:${c.reset} ${fmt(browserMs)} ${c.dim}(${Math.round(browserMs / totalMs * 100)}%)${c.reset}`)
  },

  video: (path: string) => {
    console.log(`${c.dim}${icons.circle} video: ${path}${c.reset}`)
  },

  error: (msg: string) => {
    console.error(`${c.red}${icons.cross} ${msg}${c.reset}`)
  },

  planning: () => {
    process.stdout.write(`${c.dim}planning...${c.reset}`)
  },

  planDone: () => {
    process.stdout.write(`\r${c.dim}planning... done${c.reset}\n\n`)
  },

  loadStart: () => {
    loadSpinner = new Spinner("load")
    loadSpinner.start()
  },

  loadStop: () => {
    if (loadSpinner) {
      loadSpinner.stop()
      loadSpinner = null
    }
  },

  receiveStart: () => {
    receiveSpinner = new Spinner("receive")
    receiveSpinner.start()
  },

  receiveStop: () => {
    if (receiveSpinner) {
      receiveSpinner.stop()
      receiveSpinner = null
    }
  },

  openStart: () => {
    openSpinner = new Spinner("opening")
    openSpinner.start()
  },

  openStop: () => {
    if (openSpinner) {
      openSpinner.stop()
      openSpinner = null
    }
  },
}
