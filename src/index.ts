#!/usr/bin/env bun
import { Agent } from "./agent"
import type { AgentConfig } from "./types"

const defaultConfig: AgentConfig = {
  moUrl: "http://localhost:8080",
  model: "glm-4.7",
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
    console.error("[error] provide a goal: bun run traw run \"your goal\"")
    process.exit(1)
  }

  console.log("[traw] starting agent...")
  console.log(`  mo: ${config.moUrl}`)
  console.log(`  headless: ${config.headless}`)
  console.log(`  video: ${config.recordVideo}`)
  console.log(`  max steps: ${config.maxSteps}`)

  const agent = new Agent(config)

  try {
    const history = await agent.run(goal)

    console.log("\n[done] steps:", history.length)
    if (history.length > 0) {
      const last = history[history.length - 1]
      console.log("  final:", last.action.type, "-", last.action.reason)
    }
  } catch (err: any) {
    console.error("\n[error]", err.message)
    process.exit(1)
  }
}

function printHelp() {
  console.log(`
traw - AI browser agent

Usage:
  traw run "your goal here"

Options:
  --headless    run without visible browser
  --video       enable video recording
  --steps=N     max steps (default: 20)
  --mo=URL      mo server url (default: http://localhost:8080)

Examples:
  traw run "find the weather in Moscow"
  traw run --video "search for bun.js documentation"
`)
}

main()
