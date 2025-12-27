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
  selector?: string
  text?: string
  direction?: "up" | "down"
  reason: string
}

export interface PageState {
  url: string
  title: string
  dom: string
  content?: string
  screenshot?: string
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
  thinking: boolean
  headless: boolean
  recordVideo: boolean
  maxSteps: number
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
