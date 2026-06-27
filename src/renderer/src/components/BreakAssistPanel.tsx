import React from 'react'

interface BreakAssistPanelProps {
  onBack: () => void
}

export function BreakAssistPanel({ onBack }: BreakAssistPanelProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px 20px',
        textAlign: 'center' as 'center',
      }}
    >
      {/* Heading */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.9)',
          marginBottom: '10px',
        }}
      >
        On a Break
      </div>

      {/* Subtext */}
      <div
        style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.5)',
          lineHeight: '1.5',
          marginBottom: '24px',
        }}
      >
        Capture continues while you&apos;re away.
        <br />
        You&apos;ll see a digest of what you missed when you return.
      </div>

      {/* I'm Back button */}
      <button
        onClick={onBack}
        style={{
          background: '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          padding: '8px 24px',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        I&apos;m Back
      </button>
    </div>
  )
}
