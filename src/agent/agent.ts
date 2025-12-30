import type { Action, AgentConfig, AgentStep, ChatMessage, MessageContent, PageState } from "../types"
import { BrowserController } from "../browser/controller"
import { MoClient } from "../api/mo-client"
import { log } from "../utils/log"
import { systemPrompt, planningPrompt } from "./prompts"

export class Agent {
  private browser: BrowserController
  private mo: MoClient
  private config: AgentConfig
  private history: AgentStep[] = []
  private messages: ChatMessage[] = []
  private plan = ""

  // time tracking
  private aiTime = 0
  private browserTime = 0
  private startTime = 0

  constructor(config: AgentConfig) {
    this.config = config
    this.browser = new BrowserController(config)
    this.mo = new MoClient(config.moUrl, config.model, config.thinking)
  }

  async run(goal: string): Promise<{ history: AgentStep[]; video: string | null }> {
    this.startTime = Date.now()

    const planStart = Date.now()
    log.planning()
    this.plan = await this.createPlan(goal)
    this.aiTime += Date.now() - planStart
    log.planDone()
    log.plan(this.plan)

    log.openStart()
    await this.browser.launch()
    await this.browser.execute({
      type: "goto",
      text: "https://html.duckduckgo.com/html/",
      reason: "start page",
    })
    log.openStop()

    this.messages.push({ role: "system", content: systemPrompt })
    this.messages.push({
      role: "user",
      content: `Your task: ${goal}\n\nYour plan:\n${this.plan}\n\nFollow this plan step by step. You are now on DuckDuckGo search.`,
    })

    let finalReason = ""

    try {
      for (let step = 0; step < this.config.maxSteps; step++) {
        const loadStart = Date.now()
        log.loadStart()
        const state = await this.browser.getState(this.config.useVision)
        log.loadStop()
        this.browserTime += Date.now() - loadStart

        log.step(step + 1, this.config.maxSteps, state.url)

        const thinkStart = Date.now()
        log.receiveStart()
        const decision = await this.think(state)
        log.receiveStop()
        this.aiTime += Date.now() - thinkStart

        log.thought(decision.thought)
        const target = decision.action.index !== undefined 
          ? `[${decision.action.index}] ${decision.action.text || ""}`
          : decision.action.text
        log.action(decision.action.type, target)

        const execStart = Date.now()
        const result = await this.browser.execute(decision.action)
        this.browserTime += Date.now() - execStart

        if (result.startsWith("error:")) {
          log.fail(result)
        } else {
          log.ok()
        }

        this.history.push({
          timestamp: Date.now(),
          thought: decision.thought,
          action: decision.action,
          result,
        })

        if (decision.action.type === "done") {
          finalReason = decision.action.reason
          break
        }

        await new Promise((r) => setTimeout(r, 300))
      }
    } finally {
      const videoPath = await this.browser.close()
      const totalTime = Date.now() - this.startTime
      log.done(this.history.length, finalReason)
      log.stats(totalTime, this.aiTime, this.browserTime)
      return { history: this.history, video: videoPath }
    }
  }

  private async createPlan(goal: string): Promise<string> {
    return this.mo.chat([
      { role: "system", content: planningPrompt },
      { role: "user", content: `Goal: ${goal}` },
    ])
  }

  private async think(state: PageState): Promise<{ thought: string; action: Action }> {
    const stateText = `URL: ${state.url}
Title: ${state.title}

Elements:
${state.text}

What's your next action?`

    if (this.config.debug) {
      console.log("\n" + state.text)
    }

    if (state.screenshot) {
      const content: MessageContent[] = [
        { type: "image_url", image_url: { url: state.screenshot } },
        { type: "text", text: stateText },
      ]
      this.messages.push({ role: "user", content })
    } else {
      this.messages.push({ role: "user", content: stateText })
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await this.mo.chat(this.messages)
      const parsed = this.parseResponse(response)

      if (parsed) {
        this.messages.push({ role: "assistant", content: response })
        return parsed
      }

      if (attempt < 2) {
        log.fail(`parse error, retry ${attempt + 2}/3`)
        this.messages.push({ role: "assistant", content: response })
        this.messages.push({ role: "user", content: "Invalid JSON. Reply with valid JSON only, no markdown." })
      }
    }

    return {
      thought: "failed to parse response",
      action: { type: "wait", reason: "parse error" },
    }
  }

  private parseResponse(response: string): { thought: string; action: Action } | null {
    try {
      let jsonStr = response

      // try extract from markdown block
      const match = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        jsonStr = match[1]
      }

      const parsed = JSON.parse(jsonStr.trim())
      if (!parsed.action?.type) return null

      return {
        thought: parsed.thought || "thinking...",
        action: parsed.action,
      }
    } catch (err) {
      // debug parse errors - append to log (fire and forget)
      const logEntry = `\n--- ${new Date().toISOString()} ---\nError: ${err}\nResponse:\n${response}\n`
      import("fs").then(fs => {
        fs.appendFileSync("agent-errors.log", logEntry)
      }).catch(() => {})
      return null
    }
  }
}
