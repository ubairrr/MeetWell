import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

export class LLMAdapter {
  private client: OpenAI
  private onUsage?: (model: string, inputTokens: number, outputTokens: number) => void

  constructor(
    apiKey: string,
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai',
    onUsage?: (model: string, inputTokens: number, outputTokens: number) => void
  ) {
    this.client = new OpenAI({ apiKey, baseURL })
    this.onUsage = onUsage
  }

  async generate<T extends z.ZodTypeAny>(
    schema: T,
    schemaName: string,
    systemPrompt: string,
    userContent: string
  ): Promise<z.output<T>> {
    const model = 'gemini-2.5-flash'
    const completion = await this.client.chat.completions.parse({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: zodResponseFormat(schema, schemaName),
      // Disable Gemini 2.5 Flash built-in thinking — it runs by default and
      // inflates output tokens ~14× without meaningfully improving extraction quality.
      // @ts-expect-error — Gemini-specific extension not in OpenAI SDK types
      thinking_config: { thinking_budget: 0 },
    })

    if (completion.usage) {
      this.onUsage?.(model, completion.usage.prompt_tokens, completion.usage.completion_tokens)
    }

    const parsed = completion.choices[0].message.parsed
    if (parsed !== null && parsed !== undefined) {
      return parsed as T
    }

    // Fallback: parse raw content string manually
    const raw = completion.choices[0].message.content
    if (raw) {
      return schema.parse(JSON.parse(raw))
    }

    throw new Error(`LLMAdapter: failed to parse response for schema ${schemaName}`)
  }

  async *stream(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): AsyncIterable<string> {
    const model = 'gemini-2.5-flash'
    const stream = await this.client.chat.completions.stream({
      model,
      messages,
    })
    for await (const chunk of stream) {
      yield chunk.choices[0]?.delta?.content ?? ''
    }
    const finalCompletion = await stream.finalChatCompletion()
    if (finalCompletion.usage) {
      this.onUsage?.(model, finalCompletion.usage.prompt_tokens, finalCompletion.usage.completion_tokens)
    }
  }
}
