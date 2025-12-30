#!/usr/bin/env bun
import { Agent } from "../agent/agent"
import type { AgentConfig } from "../types"
import { log } from "../utils/log"
import { printHelp } from "./help"

const defaultConfig: AgentConfig = {
  moUrl: "http://localhost:8804",
  model: "glm-4.7",
  thinking: true,
  headless: false,
  recordVideo: false,
  maxSteps: 20,
  useVision: false,
  debug: false,
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
    vision: config.useVision,
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

main()
