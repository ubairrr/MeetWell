import OpenAI from 'openai'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 1536

export class EmbeddingAdapter {
  private client: OpenAI

  constructor(
    apiKey: string,
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai'
  ) {
    this.client = new OpenAI({ apiKey, baseURL })
  }

  /**
   * Converts text into a 1536-dimensional Float32Array via Gemini text-embedding.
   *
   * Callers pass a single concatenated text string (all epoch structured fields
   * joined). This method does NOT split or chunk — that is the caller's
   * responsibility (D-06).
   *
   * Throws if the returned vector length is not exactly 1536, guarding against
   * silent model changes returning different dimensions (T-10-02-B).
   */
  async embed(text: string): Promise<Float32Array> {
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    const embedding: number[] = response.data[0].embedding

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `EmbeddingDimensionError: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
      )
    }

    return new Float32Array(embedding)
  }
}
