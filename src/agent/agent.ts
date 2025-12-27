import type { Action, AgentConfig, AgentStep, ChatMessage, MessageContent, PageState } from "../types"
import { BrowserController } from "../browser/controller"
import { MoClient } from "../api/mo-client"
import { log } from "../utils/log"
import { systemPrompt, systemPromptVision, planningPrompt } from "./prompts"

export class Agent {
  private browser: BrowserController
  private mo: MoClient
  private config: AgentConfig
  private history: AgentStep[] = []
  private messages: ChatMessage[] = []
  private plan = ""

  constructor(config: AgentConfig) {
    this.config = config
    this.browser = new BrowserController(config)
    this.mo = new MoClient(config.moUrl, config.model, config.thinking)
  }

  async run(goal: string): Promise<{ history: AgentStep[]; video: string | null }> {
    log.planning()
    this.plan = await this.createPlan(goal)
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

    const prompt = this.config.useVision ? systemPromptVision : systemPrompt
    this.messages.push({ role: "system", content: prompt })
    this.messages.push({
      role: "user",
      content: `Your task: ${goal}\n\nYour plan:\n${this.plan}\n\nFollow this plan step by step. You are now on DuckDuckGo search.`,
    })

    let finalReason = ""

    try {
      for (let step = 0; step < this.config.maxSteps; step++) {
        log.loadStart()
        const state = await this.browser.getState(this.config.useVision)
        log.loadStop()

        log.step(step + 1, this.config.maxSteps, state.url)

        log.receiveStart()
        const decision = await this.think(state)
        log.receiveStop()

        log.thought(decision.thought)
        log.action(decision.action.type, decision.action.selector || decision.action.text)

        const result = await this.browser.execute(decision.action)

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
      log.done(this.history.length, finalReason)
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
    const contentSection = state.content
      ? `\nPage content:\n${state.content}\n`
      : ""

    const stateText = `Current page:
URL: ${state.url}
Title: ${state.title}
${contentSection}
Interactive elements:
${state.dom}

What's your next action?`

    // build message with or without screenshot
    if (state.screenshot) {
      const content: MessageContent[] = [
        { type: "image_url", image_url: { url: state.screenshot } },
        { type: "text", text: stateText },
      ]
      this.messages.push({ role: "user", content })
    } else {
      this.messages.push({ role: "user", content: stateText })
    }

    const response = await this.mo.chat(this.messages)

    try {
      let jsonStr = response

      const match = response.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        jsonStr = match[1]
      }

      const parsed = JSON.parse(jsonStr.trim())
      this.messages.push({ role: "assistant", content: response })

      return {
        thought: parsed.thought || "thinking...",
        action: parsed.action,
      }
    } catch {
      console.error("failed to parse AI response:", response)
      return {
        thought: "couldn't parse response, waiting...",
        action: { type: "wait", reason: "parse error" },
      }
    }
  }
}
