import type { ChatMessage } from "./types"

export class MoClient {
  private url: string
  private model: string

  constructor(url: string, model: string) {
    this.url = url
    this.model = model
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const resp = await fetch(`${this.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        thinking: false,
      }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`mo error: ${resp.status} ${body}`)
    }

    const data = (await resp.json()) as {
      choices: { message: { content: string } }[]
    }

    return data.choices[0]?.message?.content ?? ""
  }
}
