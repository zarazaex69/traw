// ansi color codes for terminal output

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
}

export const log = {
  info: (tag: string, msg: string) => {
    console.log(`${c.cyan}[${tag}]${c.reset} ${msg}`)
  },

  step: (n: number) => {
    console.log(`\n${c.magenta}--- step ${n} ---${c.reset}`)
  },

  dim: (label: string, value: string) => {
    console.log(`${c.dim}${label}:${c.reset} ${value}`)
  },

  thought: (msg: string) => {
    console.log(`${c.yellow}thought:${c.reset} ${msg}`)
  },

  action: (type: string, reason: string) => {
    console.log(`${c.blue}action:${c.reset} ${type} - ${reason}`)
  },

  result: (msg: string) => {
    console.log(`${c.green}result:${c.reset} ${msg}`)
  },

  done: (msg?: string) => {
    console.log(`\n${c.green}[done]${c.reset}${msg ? " " + msg : ""}`)
  },

  error: (msg: string) => {
    console.error(`${c.red}[error]${c.reset} ${msg}`)
  },

  plan: (text: string) => {
    console.log(`\n${c.dim}${text}${c.reset}\n`)
  },
}
