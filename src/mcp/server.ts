#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { Agent } from "../agent/agent"
import type { AgentConfig } from "../types"

const defaultConfig: AgentConfig = {
  moUrl: process.env.TRAW_MO_URL || "http://localhost:8080",
  model: process.env.TRAW_MODEL || "glm-4.7",
  thinking: process.env.TRAW_THINKING !== "false",
  headless: process.env.TRAW_HEADLESS !== "false",
  recordVideo: process.env.TRAW_VIDEO === "true",
  maxSteps: parseInt(process.env.TRAW_MAX_STEPS || "20"),
  useVision: process.env.TRAW_VISION === "true",
  debug: process.env.TRAW_DEBUG === "true",
}

const server = new McpServer({
  name: "traw",
  version: "0.1.0",
})

function log(level: "debug" | "info" | "warning" | "error", message: string) {
  server.server.sendLoggingMessage({ level, data: message })
}

server.tool(
  "run_browser_task",
  "Run an AI browser agent to complete a task on the web. The agent can navigate, click, type, and extract information from websites.",
  {
    goal: z.string().describe("The task for the browser agent to complete, e.g. 'find the weather in Moscow' or 'search for bun.js documentation'"),
    headless: z.boolean().optional().describe("Run browser without visible window (default: true)"),
    maxSteps: z.number().optional().describe("Maximum steps the agent can take (default: 20)"),
    useVision: z.boolean().optional().describe("Send page screenshots to AI for visual understanding (default: false)"),
  },
  async ({ goal, headless, maxSteps, useVision }) => {
    log("info", `Starting task: "${goal}"`)
    log("debug", `Config: headless=${headless ?? defaultConfig.headless}, maxSteps=${maxSteps ?? defaultConfig.maxSteps}, vision=${useVision ?? defaultConfig.useVision}`)

    const config: AgentConfig = {
      ...defaultConfig,
      headless: headless ?? defaultConfig.headless,
      maxSteps: maxSteps ?? defaultConfig.maxSteps,
      useVision: useVision ?? defaultConfig.useVision,
    }

    const agent = new Agent(config)

    try {
      log("info", "Launching browser...")
      const result = await agent.run(goal)

      const steps = result.history.map((step, i) => {
        log("debug", `Step ${i + 1}: ${step.action.type} - ${step.result}`)
        return {
          step: i + 1,
          thought: step.thought,
          action: step.action.type,
          result: step.result,
        }
      })

      const lastStep = result.history[result.history.length - 1]
      const finalResult = lastStep?.action.reason || "Task completed"

      log("info", `Task completed in ${steps.length} steps`)
      if (result.video) {
        log("info", `Video saved: ${result.video}`)
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              result: finalResult,
              steps: steps.length,
              video: result.video,
              history: steps,
            }, null, 2),
          },
        ],
      }
    } catch (err: any) {
      log("error", `Task failed: ${err.message}`)
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: err.message,
            }, null, 2),
          },
        ],
        isError: true,
      }
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
