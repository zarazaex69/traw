#!/usr/bin/env bun
import { Agent } from "../agent/agent"
import type { AgentConfig } from "../types"
import { log, setSilent } from "../utils/log"
import { pingMo, isMoInstalled, downloadMo, startMo, stopMo } from "../utils/mo-manager"
import { printHelp } from "./help"
import { VERSION, checkForUpdates } from "../utils/version"
import { checkFirstRun, markFirstRunDone, showStarBanner } from "../utils/first-run"

const DEFAULT_MO_PORT = 8804

const defaultConfig: AgentConfig = {
  moUrl: `http://localhost:${DEFAULT_MO_PORT}`,
  model: "glm-4.7",
  thinking: true,
  headless: true,
  recordVideo: false,
  maxSteps: 20,
  useVision: false,
  debug: false,
  jsonOutput: false,
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question)
  for await (const line of console) {
    return line.trim()
  }
  return ""
}

async function ensureMo(moUrl: string): Promise<boolean> {
  // check if mo is already running
  if (await pingMo(moUrl)) {
    return true
  }

  // mo not running, check if installed
  const installed = await isMoInstalled()

  if (!installed) {
    const answer = await prompt("mo server not found. install mo? [Y/n] ")
    if (answer.toLowerCase() === "n") {
      log.error("mo is required to run traw")
      return false
    }

    try {
      await downloadMo()
    } catch (err: any) {
      log.error(`failed to install mo: ${err.message}`)
      return false
    }
  }

  // start mo
  try {
    const port = parseInt(new URL(moUrl).port) || DEFAULT_MO_PORT
    await startMo(port)
    return true
  } catch (err: any) {
    log.error(`failed to start mo: ${err.message}`)
    return false
  }
}

async function registerAccount(moUrl: string): Promise<void> {
  log.info("registering new account...")
  log.info("browser will open for captcha solving")

  const resp = await fetch(`${moUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || `registration failed: ${resp.status}`)
  }

  const data = await resp.json() as {
    success: boolean
    token: { id: string; email: string; active: boolean }
  }

  if (!data.success) {
    throw new Error("registration failed")
  }

  log.success(`registered: ${data.token.email}`)
  log.info(`token id: ${data.token.id}`)
  log.info("token is now active and ready to use")
}

async function main() {
  const args = process.argv.slice(2)

  // show star banner on first run (non-blocking)
  if (await checkFirstRun()) {
    showStarBanner()
    await markFirstRunDone()
  }

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp()
    return
  }

  const cmd = args[0]

  // handle version command
  if (cmd === "--version" || cmd === "-v") {
    console.log(`traw ${VERSION}`)
    return
  }

  // handle update check command
  if (cmd === "upd" || cmd === "update") {
    log.info(`current version: ${VERSION}`)
    log.info("checking for updates...")

    const update = await checkForUpdates()
    if (!update) {
      log.error("failed to check for updates")
      process.exit(1)
    }

    if (update.hasUpdate) {
      console.log()
      log.success(`new version available: ${update.latest}`)
      log.info(`download: ${update.url}`)
    } else {
      log.success("you're on the latest version!")
    }
    return
  }

  // handle auth command
  if (cmd === "auth") {
    let moUrl = defaultConfig.moUrl
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith("--mo=")) {
        moUrl = args[i].split("=")[1]
      }
    }

    if (!await ensureMo(moUrl)) {
      process.exit(1)
    }

    try {
      await registerAccount(moUrl)
    } catch (err: any) {
      log.error(err.message)
      process.exit(1)
    } finally {
      stopMo()
    }
    return
  }

  if (cmd !== "run") {
    console.error(`unknown command: ${cmd}`)
    process.exit(1)
  }

  const config = { ...defaultConfig }
  const goalParts: string[] = []

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--headless") {
      config.headless = true
      continue
    }
    if (arg === "--no-headless" || arg === "--headed") {
      config.headless = false
      continue
    }
    if (arg === "--video") {
      config.recordVideo = true
      continue
    }
    if (arg === "--vision") {
      config.useVision = true
      continue
    }
    if (arg === "--fast") {
      config.model = "0727-106B-API"
      config.thinking = false
      continue
    }
    if (arg === "--debug") {
      config.debug = true
      continue
    }
    if (arg === "--json") {
      config.jsonOutput = true
      continue
    }
    if (arg.startsWith("--steps=")) {
      config.maxSteps = parseInt(arg.split("=")[1])
      continue
    }
    if (arg.startsWith("--mo=")) {
      config.moUrl = arg.split("=")[1]
      continue
    }
    if (!arg.startsWith("--")) {
      goalParts.push(arg)
    }
  }

  const goal = goalParts.join(" ")
  if (!goal) {
    log.error("provide a goal: bun run traw run \"your goal\"")
    process.exit(1)
  }

  if (!config.jsonOutput) {
    log.header(goal)
    log.config({
      mo: config.moUrl,
      model: config.model,
      headless: config.headless,
      video: config.recordVideo,
      vision: config.useVision,
      steps: config.maxSteps,
    })
  } else {
    setSilent(true)
  }

  // ensure mo is running
  if (!await ensureMo(config.moUrl)) {
    process.exit(1)
  }

  const agent = new Agent(config)

  try {
    const result = await agent.run(goal)

    if (config.jsonOutput) {
      const output = {
        success: true,
        goal,
        steps: result.history,
        video: result.video,
      }
      console.log(JSON.stringify(output))
    } else if (result.video) {
      log.video(result.video)
    }
  } catch (err: any) {
    if (config.jsonOutput) {
      const output = {
        success: false,
        goal,
        error: err.message,
      }
      console.log(JSON.stringify(output))
      process.exit(1)
    }
    log.error(err.message)
    process.exit(1)
  } finally {
    stopMo()
  }
}

main()
