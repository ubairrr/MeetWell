import React, { useState } from 'react'

interface ConsentGateProps {
  onConfirmed: () => void
}

export function ConsentGate({ onConfirmed }: ConsentGateProps): React.JSX.Element {
  const [agreed, setAgreed] = useState(false)

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
