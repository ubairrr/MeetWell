import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

export class LLMAdapter {
  private client: OpenAI

  constructor(
    apiKey: string,
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai'
  ) {
    this.client = new OpenAI({ apiKey, baseURL })
  }

  async generate<T>(
    schema: z.ZodSchema<T>,
    schemaName: string,
    systemPrompt: string,
    userContent: string
  ): Promise<T> {
    const completion = await this.client.chat.completions.parse({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    })

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
    const stream = await this.client.chat.completions.stream({
      model: 'gemini-2.5-flash',
      messages,
    })
    for await (const chunk of stream) {
      yield chunk.choices[0]?.delta?.content ?? ''
    }
  }
}
