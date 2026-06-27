import React, { useState, useEffect } from 'react'
import type { SessionState } from '../../shared/schemas'
import type { StoredSummaryCard } from '../../shared/schemas'
import { ConsentGate } from './components/ConsentGate'
import { CapturingScreen } from './components/CapturingScreen'
import type { HealthStatus } from './components/ChannelHealthDot'
import { ChannelHealthDot } from './components/ChannelHealthDot'
import { ArtifactReview } from './components/ArtifactReview'
import { AudioWorkletHost } from './components/AudioWorkletHost'
import LiveSummaryBoard from './components/LiveSummaryBoard'
import { BreakAssistPanel } from './components/BreakAssistPanel'
import { BreakAssistDigest } from './components/BreakAssistDigest'
import { SettingsPanel } from './components/SettingsPanel'

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

function useSummaryCards(): StoredSummaryCard[] {
  const [cards, setCards] = useState<StoredSummaryCard[]>([])

  useEffect(() => {
    // window.electronAPI.on returns void — no unsubscribe available
    window.electronAPI.on('summary-card-ready', (payload: unknown) => {
      const card = payload as StoredSummaryCard
      setCards(prev => [card, ...prev]) // newest first
    })
  }, [])

  return cards
}

interface BreakDigest {
  cards: StoredSummaryCard[]
  isEmpty: boolean
}

function useBreakDigest(): { digest: BreakDigest | null; clearDigest: () => void } {
  const [digest, setDigest] = useState<BreakDigest | null>(null)

  useEffect(() => {
    // window.electronAPI.on returns void — no unsubscribe available
    window.electronAPI.on('break-assist-digest-ready', (payload: unknown) => {
      const { cardsMissed, isEmpty } = payload as { cardsMissed: StoredSummaryCard[]; isEmpty: boolean }
      setDigest({ cards: cardsMissed, isEmpty })
    })
  }, [])

  return { digest, clearDigest: () => setDigest(null) }
}

const overlayStyle: React.CSSProperties = {
  width: '380px',
  minHeight: '100vh',
  background: 'rgba(0,0,0,0.85)',
  color: '#fff',
  position: 'relative',
}

function QuitButton(): React.JSX.Element {
  return (
    <button
      onClick={() => window.electronAPI.invoke('quit-app').catch(console.error)}
      title="Quit MeetingAssist"
      style={{
        position: 'absolute',
        top: '8px',
        right: '36px',
        width: '22px',
        height: '22px',
        background: 'transparent',
        border: 'none',
        color: '#4b5563',
        fontSize: '16px',
        lineHeight: '22px',
        cursor: 'pointer',
        padding: 0,
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#4b5563' }}
    >
      ×
    </button>
  )
}

function GearButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '14px',
        cursor: 'pointer',
        lineHeight: 1,
        padding: '2px 4px',
        zIndex: 10,
      }}
      title="Settings"
    >
      ⚙
    </button>
  )
}

export default function App(): React.JSX.Element {
  const sessionState = useSessionState()
  const { healthMic, healthSystem } = useCapturingHealth()
  const summaryCards = useSummaryCards()
  const hasSummaryCards = summaryCards.length > 0
  const proposals = useArtifactProposals()
  const { digest, clearDigest } = useBreakDigest()
  const [showDigest, setShowDigest] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Wire digest arrival to showDigest
  useEffect(() => {
    if (digest !== null) {
      setShowDigest(true)
    }
  }, [digest])

  // AudioWorkletHost is always mounted (active prop controls mic lifecycle)
  const isCapturing = sessionState === 'Capturing'

  // Wraps each session view in the overlay-root container with gear button and settings panel
  function withChrome(inner: React.JSX.Element): React.JSX.Element {
    return (
      <div id="overlay-root" style={{ ...overlayStyle, position: 'relative' }}>
        <GearButton onClick={() => setShowSettings(true)} />
        {inner}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>
    )
  }

  function renderContent(): React.JSX.Element {
    if (sessionState === 'OnBreak') {
      return withChrome(
        <BreakAssistPanel
          onBack={() => window.electronAPI.invoke('end-break').catch(console.error)}
        />
      )
    }

    if (sessionState === 'Capturing') {
      if (!hasSummaryCards) {
        // Pre-board: show existing CapturingScreen unchanged
        return withChrome(
          <>
            <QuitButton />
            <CapturingScreen healthMic={healthMic} healthSystem={healthSystem} />
          </>
        )
      }

      // Show digest if it just arrived after returning from break
      if (showDigest && digest) {
        return (
          <div id="overlay-root" style={{ ...overlayStyle, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <GearButton onClick={() => setShowSettings(true)} />
            <BreakAssistDigest
              cards={digest.cards}
              isEmpty={digest.isEmpty}
              onDismiss={() => {
                setShowDigest(false)
                clearDigest()
              }}
            />
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>
        )
      }

      // Board view: compact header + LiveSummaryBoard + Going on Break
      return (
        <div id="overlay-root" style={{ ...overlayStyle, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <GearButton onClick={() => setShowSettings(true)} />
          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          {/* Compact top bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <ChannelHealthDot status={healthMic} label="Mic" />
            <button
              onClick={() => window.electronAPI.invoke('end-meeting').catch(console.error)}
              style={{
                fontSize: '11px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                color: 'rgba(255,255,255,0.7)',
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              Stop Meeting
            </button>
          </div>

          {/* Card list */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <LiveSummaryBoard cards={summaryCards} />
          </div>

          {/* Break button footer */}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <button
              onClick={() => window.electronAPI.invoke('start-break').catch(console.error)}
              style={{
                width: '100%',
                fontSize: '12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.65)',
                padding: '6px 0',
                cursor: 'pointer',
              }}
            >
              Going on Break
            </button>
          </div>
        </div>
      )
    }

    if (sessionState === 'PreCapture') {
      return withChrome(
        <>
          <QuitButton />
          <ConsentGate onConfirmed={() => {}} />
        </>
      )
    }

    if (sessionState === 'Complete') {
      if (!proposals) {
        // Processing state — transient spinner, no gear icon
        return (
          <div id="overlay-root" style={overlayStyle}>
            <QuitButton />
            <div style={{ padding: '16px', fontSize: '13px', color: '#9ca3af' }}>
              Processing artifacts...
            </div>
          </div>
        )
      }
      return (
        <div id="overlay-root" style={{ ...overlayStyle, overflowY: 'auto', position: 'relative' }}>
          <GearButton onClick={() => setShowSettings(true)} />
          <QuitButton />
          <ArtifactReview meetingId={proposals.meetingId} artifacts={proposals} />
          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        </div>
      )
    }

    if (sessionState === 'Idle') {
      return withChrome(
        <>
          <QuitButton />
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
        </>
      )
    }

    return withChrome(
      <>
        <QuitButton />
        <div style={{ padding: '16px', fontSize: '13px', color: '#ccc' }}>
          MeetingAssist — {sessionState}
        </div>
      </>
    )
  }

  return (
    <>
      <AudioWorkletHost active={isCapturing} />
      {renderContent()}
    </>
  )
}
