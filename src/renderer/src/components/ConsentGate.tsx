import React, { useState } from 'react'

export interface PermissionStatus {
  microphone: string
  screen: string
}

interface PermissionWarningCardProps {
  label: string
  settingsKey: 'microphone' | 'screen'
}

function PermissionWarningCard({ label, settingsKey }: PermissionWarningCardProps): React.JSX.Element {
  return (
    <div
      style={{
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '10px',
        fontSize: '12px',
        color: '#fca5a5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      <span>{label} access is required. Enable it in System Preferences &gt; Privacy &gt; {label}.</span>
      <button
        onClick={() =>
          window.electronAPI.invoke('open-permission-settings', settingsKey).catch(console.error)
        }
        style={{
          flexShrink: 0,
          fontSize: '11px',
          background: 'rgba(239,68,68,0.25)',
          border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: '4px',
          color: '#fca5a5',
          padding: '3px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Fix in System Preferences &rarr;
      </button>
    </div>
  )
}

interface ConsentGateProps {
  onConfirmed: () => void
  permissionStatus?: PermissionStatus
}

export function ConsentGate({ onConfirmed, permissionStatus }: ConsentGateProps): React.JSX.Element {
  const [agreed, setAgreed] = useState(false)

  const micBlocked =
    permissionStatus?.microphone === 'denied' || permissionStatus?.microphone === 'restricted'
  const screenBlocked =
    permissionStatus?.screen === 'denied' || permissionStatus?.screen === 'restricted'

  async function handleConfirm() {
    if (!agreed) return
    await window.electronAPI.invoke('consent-confirmed', {
      meetingId: crypto.randomUUID(),
      timestamp: Date.now(),
    })
    onConfirmed()
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      {micBlocked && (
        <PermissionWarningCard
          label="Microphone"
          settingsKey="microphone"
        />
      )}
      {screenBlocked && (
        <PermissionWarningCard
          label="Screen Recording"
          settingsKey="screen"
        />
      )}
      <h2 style={{ marginTop: 0, fontSize: '16px' }}>Recording Disclosure</h2>
      <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
        This session will capture audio from your microphone and system audio.
        Transcripts are stored locally and encrypted with AES-256. Audio is discarded
        after transcription. No data leaves your device without your explicit action.
      </p>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        I understand and consent to recording this session
      </label>
      <button
        onClick={handleConfirm}
        disabled={!agreed}
        style={{
          marginTop: '12px',
          padding: '8px 16px',
          fontSize: '13px',
          cursor: agreed ? 'pointer' : 'not-allowed',
          opacity: agreed ? 1 : 0.5,
        }}
      >
        Start Meeting
      </button>
    </div>
  )
}
