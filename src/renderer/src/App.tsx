import React, { useState, useEffect } from 'react'
import type { SessionState } from '../../shared/schemas'
import { ConsentGate } from './components/ConsentGate'

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

export default function App(): React.JSX.Element {
  const sessionState = useSessionState()

  return (
    <div id="overlay-root" style={{ width: '380px', minHeight: '100vh', background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
      {sessionState === 'PreCapture' ? (
        <ConsentGate onConfirmed={() => {}} />
      ) : (
        <div style={{ padding: '16px', fontSize: '13px', color: '#ccc' }}>
          MeetingAssist — {sessionState}
        </div>
      )}
    </div>
  )
}
