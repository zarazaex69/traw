#!/usr/bin/env bun
import { Agent } from "./agent"
import type { AgentConfig } from "./types"
import { log } from "./log"

const defaultConfig: AgentConfig = {
  moUrl: "http://localhost:8080",
  model: "glm-4.7",
  thinking: true,
  headless: false,
  recordVideo: false,
  maxSteps: 20,
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp()
    return
  }

  const cmd = args[0]
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
    if (arg === "--video") {
      config.recordVideo = true
      continue
    }
    if (arg === "--fast") {
      config.model = "0727-106B-API"
      config.thinking = false
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

  log.header(goal)
  log.config({
    mo: config.moUrl,
    model: config.model,
    headless: config.headless,
    video: config.recordVideo,
    steps: config.maxSteps,
  })

  const agent = new Agent(config)

  try {
    const result = await agent.run(goal)

    if (result.video) {
      log.video(result.video)
    }
  } catch (err: any) {
    log.error(err.message)
    process.exit(1)
  }
}

function printHelp() {
  console.log(`
traw - AI browser agent

Usage:
  traw run "your goal here"

Options:
  --fast        use fast model (glm-4-flash, no thinking)
  --headless    run without visible browser
  --video       enable video recording
  --steps=N     max steps (default: 20)
  --mo=URL      mo server url (default: http://localhost:8080)

Examples:
  traw run "find the weather in Moscow"
  traw run --fast "quick search for bun.js"
  traw run --video "search for documentation"
`)
}

main()
