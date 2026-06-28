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
    // gemini-2.5-flash is the only model available on this OpenAI-compat endpoint.
    // Thinking cannot be disabled — all thinking_config/thinking params return 400.
    // Usage tracking uses total_tokens - prompt_tokens to capture thinking tokens
    // (which Google bills as output but are not in completion_tokens).
    const model = 'gemini-2.5-flash'
    const completion = await this.client.chat.completions.parse({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    })

    if (completion.usage) {
      // total_tokens includes thinking tokens (billed by Google but not in completion_tokens).
      // Use total_tokens - prompt_tokens as the true output cost.
      const trueOutput = (completion.usage.total_tokens ?? 0) - completion.usage.prompt_tokens
      this.onUsage?.(model, completion.usage.prompt_tokens, Math.max(trueOutput, completion.usage.completion_tokens))
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
