import React, { useEffect, useState } from 'react'

interface RosterEntry {
  label: string
  excerpt: string | null
  currentName: string | null
}

interface RenameSpeakersModalProps {
  meetingId: string
  onClose: () => void
  onRenamed: (updated: Record<string, unknown>) => void
}

const SESSION_GATE_ERROR = 'rename only allowed after meeting completion'

export function RenameSpeakersModal({
  meetingId,
  onClose,
  onRenamed,
}: RenameSpeakersModalProps): React.JSX.Element {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null)
  const [staged, setStaged] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .invoke('get-speaker-roster', { meetingId })
      .then((response) => {
        if (cancelled) return
        const typed = response as { roster?: RosterEntry[]; error?: string }
        if (typed && typeof typed === 'object' && 'error' in typed && typed.error) {
          setLoadError(typed.error)
          return
        }
        const rosterList = typed.roster ?? []
        setRoster(rosterList)
        setStaged(Object.fromEntries(rosterList.map((r) => [r.label, r.currentName ?? ''])))
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [meetingId])

  if (loadError) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={errorBannerStyle}>{loadError}</div>
          <button onClick={onClose} style={cancelButtonStyle}>Cancel</button>
        </div>
      </div>
    )
  }

  if (roster === null) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>Loading…</div>
        </div>
      </div>
    )
  }

  const changedCount = roster.filter((r) => {
    const value = (staged[r.label] ?? '').trim()
    return value.length > 0 && value !== (r.currentName ?? '')
  }).length

  const handleSave = () => {
    if (changedCount === 0 || isSaving) return
    const mapping: Record<string, string> = {}
    for (const r of roster) {
      const value = (staged[r.label] ?? '').trim()
      if (value.length > 0 && value !== (r.currentName ?? '')) {
        mapping[r.label] = value
      }
    }
    setIsSaving(true)
    setSaveError(null)
    window.electronAPI
      .invoke('rename-speakers', { meetingId, mapping })
      .then((response) => {
        const typed = response as Record<string, unknown> & { error?: string }
        if (typed && typeof typed === 'object' && 'error' in typed && typed.error) {
          setSaveError(
            typed.error === SESSION_GATE_ERROR
              ? 'Renaming is only available after the meeting ends.'
              : "Couldn't save these names. Your changes weren't lost — try Save again."
          )
          setIsSaving(false)
          return
        }
        onRenamed(typed)
        onClose()
      })
      .catch(() => {
        setSaveError("Couldn't save these names. Your changes weren't lost — try Save again.")
        setIsSaving(false)
      })
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {roster.length === 0 ? (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: '1.2', color: '#fff', marginBottom: '8px' }}>
              No speakers to rename
            </div>
            <div style={{ fontSize: '12px', fontWeight: 400, lineHeight: '1.5', color: '#9ca3af', marginBottom: '16px' }}>
              This meeting has no transcript segments yet, so there's nothing to relabel.
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '16px' }}>
            {roster.map((r) => (
              <div key={r.label} style={rowStyle}>
                <div style={{ fontSize: '11px', fontWeight: 600, lineHeight: '1.4', color: '#e5e7eb', marginBottom: '4px' }}>
                  {r.label}
                </div>
                <div style={excerptStyle}>
                  {r.excerpt ?? '(no transcript excerpt available)'}
                </div>
                <input
                  type="text"
                  value={staged[r.label] ?? ''}
                  onChange={(e) => setStaged((prev) => ({ ...prev, [r.label]: e.target.value }))}
                  placeholder="Enter name…"
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        {saveError && <div style={errorBannerStyle}>{saveError}</div>}

        <div style={{ display: 'flex', gap: '8px' }}>
          {roster.length > 0 && (
            <button
              onClick={handleSave}
              disabled={changedCount === 0 || isSaving}
              style={{
                flex: 1,
                padding: '8px 0',
                background: changedCount > 0 && !isSaving ? '#2563eb' : '#1f2937',
                color: changedCount > 0 && !isSaving ? '#fff' : '#4b5563',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: changedCount > 0 && !isSaving ? 'pointer' : 'default',
              }}
            >
              {isSaving ? 'Saving...' : 'Save Names'}
            </button>
          )}
          <button onClick={onClose} style={cancelButtonStyle}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  zIndex: 10,
  overflowY: 'auto',
}

const panelStyle: React.CSSProperties = {
  width: '348px',
  boxSizing: 'border-box',
  padding: '24px 16px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid #1f2937',
  borderRadius: '8px',
  marginTop: '24px',
  marginBottom: '24px',
}

const rowStyle: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #1f2937',
  marginBottom: '8px',
}

const excerptStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  borderLeft: '2px solid #4b5563',
  fontStyle: 'italic',
  color: '#d1d5db',
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '1.5',
  padding: '8px',
  marginBottom: '8px',
  borderRadius: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid #374151',
  borderRadius: '4px',
  color: '#f3f4f6',
  fontSize: '12px',
  padding: '8px',
  outline: 'none',
}

const cancelButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 0',
  background: 'transparent',
  color: '#9ca3af',
  border: '1px solid #374151',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
}

const errorBannerStyle: React.CSSProperties = {
  border: '1px solid #dc2626',
  background: 'rgba(239,68,68,0.15)',
  color: '#fca5a5',
  borderRadius: '6px',
  padding: '8px',
  fontSize: '12px',
  marginBottom: '16px',
}
