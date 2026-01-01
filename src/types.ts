export type ActionType =
  | "click"
  | "type"
  | "scroll"
  | "goto"
  | "wait"
  | "back"
  | "done"

export interface Action {
  type: ActionType
  index?: number
  text?: string
  direction?: "up" | "down"
  reason: string
}

export interface PageState {
  url: string
  title: string
  text: string
}

export interface AgentStep {
  timestamp: number
  thought: string
  action: Action
  result?: string
}

export interface AgentConfig {
  moUrl: string
  apiUrl?: string
  apiKey?: string
  model: string
  thinking: boolean
  headless: boolean
  recordVideo: boolean
  maxSteps: number
  debug: boolean
  jsonOutput: boolean
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
