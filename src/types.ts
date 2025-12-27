// browser actions that AI can perform
export type ActionType = 
  | "click" 
  | "type" 
  | "scroll" 
  | "goto" 
  | "wait" 
  | "screenshot"
  | "done"

export interface Action {
  type: ActionType
  selector?: string      // css selector for click/type
  text?: string          // text to type or url for goto
  direction?: "up" | "down"  // scroll direction
  reason: string         // why AI decided to do this
}

export interface PageState {
  url: string
  title: string
  dom: string            // simplified DOM
  screenshot?: string    // base64 screenshot (optional)
}

export interface AgentStep {
  timestamp: number
  thought: string
  action: Action
  result?: string
}

export interface AgentConfig {
  moUrl: string
  model: string
  headless: boolean
  recordVideo: boolean
  maxSteps: number
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
