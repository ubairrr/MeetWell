export class CitationValidator {
  readonly THRESHOLD = 0.90

  tokenize(text: string): Set<string> {
    return new Set(text.toLowerCase().split(/\W+/).filter(Boolean))
  }

  score(claimText: string, quoteText: string): number {
    const a = this.tokenize(claimText)
    const b = this.tokenize(quoteText)
    if (a.size === 0 && b.size === 0) return 1.0
    if (a.size === 0 || b.size === 0) return 0.0
    let intersectionSize = 0
    for (const token of a) {
      if (b.has(token)) intersectionSize++
    }
    // Use overlap coefficient (intersection / min) so that a claim that is a
    // near-subset of a longer quote still scores ≥ THRESHOLD. Pure Jaccard
    // penalises the claim too heavily when the supporting quote has extra tokens
    // (e.g. additional context words), causing valid citations to fail.
    return intersectionSize / Math.min(a.size, b.size)
  }

  validate(claimText: string, citations: Array<{ quote_full: string }>): boolean {
    return citations.some((c) => this.score(claimText, c.quote_full) >= this.THRESHOLD)
  }
}
