import React, { useState, useEffect, useRef } from 'react'
import type { SessionState } from '../../shared/schemas'
import { ConsentGate } from './components/ConsentGate'
import { CapturingScreen } from './components/CapturingScreen'
import type { HealthStatus } from './components/ChannelHealthDot'
import { startMicCapture } from './audio/MicCapture'
import type { MicCaptureHandle } from './audio/MicCapture'
import { ArtifactReview } from './components/ArtifactReview'

function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>('Idle')

  useEffect(() => {
    window.electronAPI.on('session-state-changed', (payload: unknown) => {
      const { state: newState } = payload as { state: SessionState; previous: SessionState }
      setState(newState)
    })
  }, [])

  return state
}

function useCapturingHealth(): { healthMic: HealthStatus; healthSystem: HealthStatus } {
  const [healthMic, setHealthMic] = useState<HealthStatus>('idle')
  const [healthSystem, setHealthSystem] = useState<HealthStatus>('idle')

  useEffect(() => {
    window.electronAPI.on('capture-health-update', (payload: unknown) => {
      const { channel, status } = payload as { channel: 'mic' | 'system'; status: HealthStatus }
      if (channel === 'mic') setHealthMic(status)
      else setHealthSystem(status)
    })
  }, [])

  return { healthMic, healthSystem }
}

function useArtifactProposals() {
  const [proposals, setProposals] = useState<{
    meetingId: string
    mom: { markdown_content: string }
    summary: { summary_text: string }
    keyPoints: { key_points: Array<{ text: string; speaker_label: string | null; source_quote_preview: string; confidence: 'direct' | 'inferred' }> }
    actionItems: { action_items: Array<any> }
    error?: boolean
    errorMessage?: string
  } | null>(null)

  useEffect(() => {
    window.electronAPI.on('artifact-proposals-ready', (payload: unknown) => {
      setProposals(payload as any)
    })
  }, [])

  return proposals
}

export default function App(): React.JSX.Element {
  const sessionState = useSessionState()
  const { healthMic, healthSystem } = useCapturingHealth()
  const micHandleRef = useRef<MicCaptureHandle | null>(null)
  const proposals = useArtifactProposals()

  useEffect(() => {
    if (sessionState !== 'Capturing') return

    let cancelled = false
    startMicCapture().then((handle) => {
      if (cancelled) {
        handle.stop()
      } else {
        micHandleRef.current = handle
      }
    }).catch((err: unknown) => {
      console.error('[App] mic capture failed:', err)
    })

    return () => {
      cancelled = true
      micHandleRef.current?.stop()
      micHandleRef.current = null
    }
  }, [sessionState])

  if (sessionState === 'Capturing') {
    return (
      <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
        <CapturingScreen healthMic={healthMic} healthSystem={healthSystem} />
      </div>
    )
  }

  if (sessionState === 'PreCapture') {
    return (
      <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
        <ConsentGate onConfirmed={() => {}} />
      </div>
    )
  }

  if (sessionState === 'Complete') {
    if (!proposals) {
      return (
        <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
          <div style={{ padding: '16px', fontSize: '13px', color: '#9ca3af' }}>
            Processing artifacts...
          </div>
        </div>
      )
    }
    return (
      <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff', overflowY: 'auto' }}>
        <ArtifactReview meetingId={proposals.meetingId} artifacts={proposals} />
      </div>
    )
  }

  if (sessionState === 'Idle') {
    return (
      <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
        <div style={{ padding: '16px' }}>
          <button
            onClick={() => window.electronAPI.invoke('start-meeting').catch(console.error)}
            style={{
              width: '100%',
              padding: '8px 0',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Start Meeting
          </button>
        </div>
      </div>
    )
  }

  return (
    <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
      <div style={{ padding: '16px', fontSize: '13px', color: '#ccc' }}>
        MeetingAssist — {sessionState}
      </div>
    </div>
  )
}
