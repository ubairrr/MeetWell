import React from 'react'
import type { StoredSummaryCard } from '../../../shared/schemas'
import SummaryCard from './SummaryCard'

interface BreakAssistDigestProps {
  cards: StoredSummaryCard[]
  isEmpty: boolean
  onDismiss: () => void
}

export function BreakAssistDigest({ cards, isEmpty, onDismiss }: BreakAssistDigestProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            textTransform: 'uppercase' as 'uppercase',
            letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          While You Were Away
        </span>
        <button
          onClick={onDismiss}
          style={{
            fontSize: '11px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.6)',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto' as 'auto',
          padding: '10px 10px',
        }}
      >
        {isEmpty ? (
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.45)',
              textAlign: 'center' as 'center',
              padding: '20px 0',
            }}
          >
            Nothing to catch up on — the meeting was quiet while you were away.
          </div>
        ) : (
          cards.map((card) => (
            <SummaryCard key={card.id} card={card} isLatest={false} />
          ))
        )}
      </div>
    </div>
  )
}
