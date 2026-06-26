import { EventEmitter } from 'events'

export type SessionState =
  | 'Idle'
  | 'PreCapture'
  | 'Capturing'
  | 'OnBreak'
  | 'Processing'
  | 'Complete'

export type SessionEvent =
  | 'start-meeting'
  | 'consent-confirmed'
  | 'start-break'
  | 'end-break'
  | 'end-meeting'
  | 'pipeline-complete'
  | 'session-dismissed'

type TransitionTable = Partial<Record<SessionState, Partial<Record<SessionEvent, SessionState>>>>

const TRANSITIONS: TransitionTable = {
  Idle: {
    'start-meeting': 'PreCapture',
  },
  PreCapture: {
    'consent-confirmed': 'Capturing',
  },
  Capturing: {
    'start-break': 'OnBreak',
    'end-meeting': 'Processing',
  },
  OnBreak: {
    'end-break': 'Capturing',
  },
  Processing: {
    'pipeline-complete': 'Complete',
  },
  Complete: {
    'start-meeting': 'PreCapture',
    'session-dismissed': 'Idle',
  },
}

export class SessionManager extends EventEmitter {
  private state: SessionState = 'Idle'
  private consentReceived: boolean = false

  getState(): SessionState {
    return this.state
  }

  transition(event: SessionEvent): void {
    if (event === 'consent-confirmed') {
      this.consentReceived = true
    }

    if (
      this.state === 'PreCapture' &&
      event !== 'consent-confirmed' &&
      !this.consentReceived
    ) {
      throw new Error(
        'FSM: cannot transition from PreCapture without prior consent-confirmed event'
      )
    }

    const nextState = TRANSITIONS[this.state]?.[event]
    if (nextState === undefined) {
      throw new Error(
        `FSM: invalid transition ${this.state} --[${event}]--> (no such transition)`
      )
    }

    const previous = this.state
    this.state = nextState
    this.emit('state-change', this.state, previous)
  }

  onStateChange(cb: (state: SessionState, previous: SessionState) => void): void {
    this.on('state-change', cb)
  }
}
