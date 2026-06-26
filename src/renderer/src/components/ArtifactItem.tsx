import React, { useState } from 'react'
import { CitationPanel } from './CitationPanel'

interface ArtifactItemProps {
  id: string
  text: string
  subtext?: string
  citations: Array<{
    quote_preview: string
    quote_full: string
    speaker_label: string
    timestamp_start: number | null
    timestamp_end: number | null
    confidence: 'direct' | 'inferred'
  }>
  artifactType: 'action_item' | 'key_point' | 'mom' | 'summary'
  onConfirm: (id: string) => void
  onDismiss: (id: string) => void
  onEdit: (id: string, updates: { description?: string }) => void
}

export function ArtifactItem({
  id,
  text,
  subtext,
  citations,
  onConfirm,
  onDismiss,
  onEdit,
}: ArtifactItemProps): React.JSX.Element {
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(text)

  return (
    <div style={{ borderBottom: '1px solid #374151', padding: '8px 0' }}>
      <div>
        {isEditing ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid #4b5563',
              borderRadius: '4px',
              color: '#f3f4f6',
              fontSize: '12px',
              padding: '6px 8px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            style={{ fontSize: '12px', color: '#f3f4f6', cursor: 'pointer' }}
          >
            {text}
          </span>
        )}
      </div>
      {subtext && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{subtext}</div>
      )}
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setVerifyOpen(!verifyOpen)}
          style={{
            background: 'transparent',
            border: '1px solid #4b5563',
            color: '#9ca3af',
            borderRadius: '4px',
            fontSize: '11px',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          {verifyOpen ? 'Hide Quote' : 'Verify'}
        </button>
        {isEditing ? (
          <>
            <button
              onClick={() => {
                onEdit(id, { description: editValue })
                setIsEditing(false)
              }}
              style={{
                background: '#2563eb',
                border: 'none',
                color: '#fff',
                borderRadius: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditValue(text)
                setIsEditing(false)
              }}
              style={{
                background: 'transparent',
                border: '1px solid #4b5563',
                color: '#9ca3af',
                borderRadius: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onConfirm(id)}
              style={{
                background: '#2563eb',
                border: 'none',
                color: '#fff',
                borderRadius: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => onDismiss(id)}
              style={{
                background: 'transparent',
                border: '1px solid #374151',
                color: '#9ca3af',
                borderRadius: '4px',
                fontSize: '11px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
      <CitationPanel citations={citations} isOpen={verifyOpen} />
    </div>
  )
}
