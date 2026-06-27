import React from 'react'
import type { StoredSummaryCard } from '../../../shared/schemas'

interface SummaryCardProps {
  card: StoredSummaryCard
  isLatest?: boolean
}

export default function SummaryCard({ card, isLatest = false }: SummaryCardProps): React.JSX.Element {
  const mutedColor = 'rgba(255,255,255,0.45)'

  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        borderRadius: '8px',
        padding: '10px 14px',
        marginBottom: '8px',
        borderLeft: isLatest ? '2px solid #2563eb' : '2px solid transparent',
        boxSizing: 'border-box' as 'border-box',
      }}
    >
      {/* Timestamp label */}
      <div
        style={{
          fontSize: '10px',
          color: mutedColor,
          marginBottom: '4px',
        }}
      >
        {card.wall_time_label}
      </div>

      {/* Topic headline */}
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#f3f4f6',
          marginBottom: '8px',
          lineHeight: '1.3',
        }}
      >
        {card.topic_headline}
      </div>

      {/* Key points section */}
      <div
        style={{
          fontSize: '10px',
          color: mutedColor,
          marginBottom: '4px',
          textTransform: 'uppercase' as 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Key points
      </div>
      <ul
        style={{
          listStyle: 'disc',
          paddingLeft: '16px',
          margin: '0 0 8px 0',
        }}
      >
        {card.key_points.map((point, i) => (
          <li
            key={i}
            style={{
              fontSize: '12px',
              lineHeight: '1.4',
              marginBottom: '3px',
              color: '#f3f4f6',
            }}
          >
            {point}
          </li>
        ))}
      </ul>

      {/* Speaker contributions section (only when contributions exist) */}
      {Object.keys(card.speaker_contributions).length > 0 && (
        <div>
          <div
            style={{
              fontSize: '10px',
              color: mutedColor,
              marginBottom: '4px',
              textTransform: 'uppercase' as 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Speakers
          </div>
          {Object.entries(card.speaker_contributions).map(([speakerLabel, contribution]) => (
            <div
              key={speakerLabel}
              style={{
                fontSize: '11px',
                color: mutedColor,
                marginBottom: '3px',
              }}
            >
              <span style={{ fontWeight: 600 }}>{speakerLabel}</span>: {contribution}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
