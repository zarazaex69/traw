import type { ChatMessage } from "../types"

export interface MoClientOptions {
  moUrl: string
  apiUrl?: string
  apiKey?: string
  model: string
  thinking: boolean
}

export class MoClient {
  private url: string
  private apiKey?: string
  private model: string
  private thinking: boolean

  constructor(opts: MoClientOptions) {
    // custom api takes priority over mo
    this.url = opts.apiUrl || opts.moUrl
    this.apiKey = opts.apiKey
    this.model = opts.model
    this.thinking = opts.thinking
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }

    const resp = await fetch(`${this.url}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        thinking: this.thinking,
      }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`mo error: ${resp.status} ${body}`)
    }

    const data = (await resp.json()) as {
      choices: { message: { content: string }; finish_reason: string }[]
    }

    // debug: check if response was truncated
    const finish = data.choices[0]?.finish_reason
    if (finish && finish !== "stop") {
      console.warn(`[mo] finish_reason: ${finish} (response may be truncated)`)
    }

    return data.choices[0]?.message?.content ?? ""
  }
}
