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
  screenshot?: string // base64 data url
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
  useVision: boolean // send screenshots to AI
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | MessageContent[]
}

export interface MessageContent {
  type: "text" | "image_url"
  text?: string
  image_url?: {
    url: string
  }
}
