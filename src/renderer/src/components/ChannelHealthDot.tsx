import React from 'react'

export type HealthStatus = 'idle' | 'healthy' | 'silent' | 'error'

const STATUS_COLOR: Record<HealthStatus, string> = {
  idle:    '#6b7280',
  healthy: '#22c55e',
  silent:  '#eab308',
  error:   '#ef4444',
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  idle:    'Idle',
  healthy: 'Healthy',
  silent:  'Silent',
  error:   'Error',
}

interface ChannelHealthDotProps {
  label: string
  status: HealthStatus
}

export function ChannelHealthDot({ label, status }: ChannelHealthDotProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: STATUS_COLOR[status],
          flexShrink: 0,
        }}
        aria-label={`${label}: ${STATUS_LABEL[status]}`}
        role="status"
      />
      <span style={{ fontSize: '12px', color: '#d1d5db' }}>{label}</span>
      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{STATUS_LABEL[status]}</span>
    </div>
  )
}
