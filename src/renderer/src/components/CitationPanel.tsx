import React from 'react'

interface CitationPanelProps {
  citations: Array<{
    quote_preview: string
    quote_full: string
    speaker_label: string
    timestamp_start: number | null
    timestamp_end: number | null
    confidence: 'direct' | 'inferred'
  }>
  isOpen: boolean
}

export function CitationPanel({ citations, isOpen }: CitationPanelProps): React.JSX.Element | null {
  if (!isOpen) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      borderLeft: '2px solid #4b5563',
      padding: '8px 12px',
      marginTop: '4px',
      borderRadius: '4px',
    }}>
      {citations.map((citation, idx) => (
        <div key={idx} style={{ marginBottom: idx < citations.length - 1 ? '8px' : '0' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
            <span>{citation.speaker_label}</span>
            {citation.timestamp_start !== null && (
              <span style={{ marginLeft: '6px' }}>
                ({Math.floor(citation.timestamp_start / 60)}:{String(Math.floor(citation.timestamp_start % 60)).padStart(2, '0')})
              </span>
            )}
            {citation.confidence === 'inferred' && (
              <span style={{ marginLeft: '6px', color: '#f59e0b', fontSize: '10px' }}>
                Inferred — no direct quote
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#d1d5db', fontStyle: 'italic' }}>
            "{citation.quote_full}"
          </div>
        </div>
      ))}
    </div>
  )
}
