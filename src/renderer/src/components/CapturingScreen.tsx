import React from 'react'
import { ChannelHealthDot } from './ChannelHealthDot'
import type { HealthStatus } from './ChannelHealthDot'

interface CapturingScreenProps {
  healthMic: HealthStatus
  healthSystem: HealthStatus
}

export function CapturingScreen({ healthMic, healthSystem }: CapturingScreenProps): React.JSX.Element {
  function handleStopMeeting(): void {
    window.electronAPI.invoke('end-meeting').catch((err: unknown) => {
      console.error('[CapturingScreen] end-meeting IPC error:', err)
    })
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <ChannelHealthDot label="Mic" status={healthMic} />
        <ChannelHealthDot label="System" status={healthSystem} />
      </div>
      <button
        onClick={handleStopMeeting}
        style={{
          width: '100%',
          padding: '8px 0',
          backgroundColor: '#dc2626',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Stop Meeting
      </button>
    </div>
  )
}
