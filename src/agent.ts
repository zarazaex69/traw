import type { Action, AgentConfig, AgentStep, ChatMessage, PageState } from "./types"
import { BrowserController } from "./browser"
import { MoClient } from "./mo-client"
import { log } from "./log"

const systemPrompt = `You are a browser automation agent. You see the page state and decide what to do next.

ACTIONS:
- goto: navigate to URL
- click: click element by CSS selector
- type: type text into input (selector + text)
- scroll: scroll up/down
- wait: wait 1s
- done: task complete, report results

CSS SELECTOR RULES (CRITICAL):
- Use ONLY valid CSS selectors
- IDs: #search_form_input
- Classes: .result__a or a.result__a
- Attributes: a[href*="github.com"] or input[name="q"]
- Tag + class: button.search-btn
- NEVER use parentheses in selectors like a(something) - this is INVALID
- NEVER invent class names - use only what you see in the DOM

PAGE CONTENT:
- You receive "Page content" section with actual text from the page
- This includes headings (h1, h2, h3), paragraphs, list items, and code blocks
- USE THIS CONTENT to understand what the page is about
- Read the content carefully before deciding next action
- If you have enough information from content, you can use "done"

IMPORTANT RULES:
- Follow your plan step by step
- READ the page content to understand what you're looking at
- Do NOT use "done" until you have FULLY completed ALL steps in your plan
- If you encounter an error, try alternative approach
- Actually visit pages and read content, don't guess from search results

Respond with JSON only:
{
  "thought": "brief reasoning",
  "action": {
    "type": "click|type|goto|scroll|wait|done",
    "selector": "#valid-css-selector",
    "text": "for type/goto",
    "direction": "up|down",
    "reason": "why"
  }
}

When ALL steps complete, use "done" with full results in "reason".`

const planningPrompt = `You are a planning agent. Create a step-by-step plan to accomplish the user's goal using a web browser.

Rules:
- Be specific about what to search, click, or navigate to
- Number each step
- Keep it concise (max 10 steps)
- Start from DuckDuckGo search page

Respond with a numbered plan only, no JSON.`

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
    this.mo = new MoClient(config.moUrl, config.model)
  }

  async run(goal: string): Promise<AgentStep[]> {
    log.info("goal", goal)

    log.info("planning", "...")
    this.plan = await this.createPlan(goal)
    log.plan(this.plan)

    await this.browser.launch()
    await this.browser.execute({
      type: "goto",
      text: "https://html.duckduckgo.com/html/",
      reason: "start page",
    })

    this.messages.push({ role: "system", content: systemPrompt })
    this.messages.push({
      role: "user",
      content: `Your task: ${goal}\n\nYour plan:\n${this.plan}\n\nFollow this plan step by step. You are now on DuckDuckGo search.`,
    })

    try {
      for (let step = 0; step < this.config.maxSteps; step++) {
        const state = await this.browser.getState()

        log.step(step + 1)
        log.dim("url", state.url)
        log.dim("title", state.title)

        const decision = await this.think(state)

        log.thought(decision.thought)
        log.action(decision.action.type, decision.action.reason)

        const result = await this.browser.execute(decision.action)
        log.result(result)

        this.history.push({
          timestamp: Date.now(),
          thought: decision.thought,
          action: decision.action,
          result,
        })

        if (decision.action.type === "done") {
          log.done()
          break
        }

        await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      const videoPath = await this.browser.close()
      if (videoPath) {
        log.info("video", videoPath)
      }
    }

    return this.history
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

    const stateMsg = `Current page:
URL: ${state.url}
Title: ${state.title}
${contentSection}
Interactive elements:
${state.dom}

What's your next action?`

    this.messages.push({ role: "user", content: stateMsg })

    const response = await this.mo.chat(this.messages)

    try {
      let jsonStr = response

      // extract json from markdown code block if present
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
