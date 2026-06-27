import React from 'react'
import type { StoredSummaryCard } from '../../../shared/schemas'
import SummaryCard from './SummaryCard'

interface LiveSummaryBoardProps {
  cards: StoredSummaryCard[] // caller provides newest-first order
}

export default function LiveSummaryBoard({ cards }: LiveSummaryBoardProps): React.JSX.Element {
  const cardCountLabel = cards.length === 1 ? '1 card' : `${cards.length} cards`

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
          padding: '6px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase' as 'uppercase',
          }}
        >
          Live Summary
        </span>
        <span
          style={{
            background: 'rgba(37,99,235,0.25)',
            color: '#60a5fa',
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
          }}
        >
          {cardCountLabel}
        </span>
      </div>

      {/* Scrollable card list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto' as 'auto',
          padding: '8px 10px',
        }}
      >
        {cards.map((card, index) => (
          <SummaryCard key={card.id} card={card} isLatest={index === 0} />
        ))}
      </div>
    </div>
  )
}
