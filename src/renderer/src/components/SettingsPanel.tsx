import React, { useState, useEffect } from 'react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps): React.JSX.Element {
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [deepgramKeyInput, setDeepgramKeyInput] = useState('')
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [hasDeepgramKey, setHasDeepgramKey] = useState(false)
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [deepgramKeyStatus, setDeepgramKeyStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    window.electronAPI.invoke('set-focusable', true).catch(console.error)
    window.electronAPI.invoke('get-settings').then((settings: unknown) => {
      const s = settings as {
        hasGeminiKey: boolean
        hasDeepgramKey: boolean
      }
      setHasGeminiKey(s.hasGeminiKey)
      setHasDeepgramKey(s.hasDeepgramKey)
    }).catch(console.error)
    return () => {
      window.electronAPI.invoke('set-focusable', false).catch(console.error)
    }
  }, [])

  function saveKey(
    settingKey: 'gemini-api-key' | 'deepgram-api-key',
    value: string,
    setStatus: (s: 'idle' | 'saved' | 'error') => void
  ) {
    if (!value.trim()) return
    window.electronAPI
      .invoke('set-setting', { key: settingKey, value: value.trim() })
      .then(() => {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      })
      .catch(() => {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2000)
      })
  }


  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '10px',
  }

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '6px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    padding: '6px 8px',
    boxSizing: 'border-box',
    marginBottom: '6px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    background: '#2563eb',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    padding: '5px 12px',
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 10, 15, 0.97)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
          Settings
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '16px',
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

        {/* Section: API Keys */}
        <div style={sectionLabelStyle}>API Keys</div>

        {/* Gemini API Key */}
        <div style={fieldLabelStyle}>Gemini API Key</div>
        <input
          type="password"
          value={geminiKeyInput}
          onChange={(e) => setGeminiKeyInput(e.target.value)}
          placeholder={
            hasGeminiKey ? 'Key saved — enter new key to replace' : 'Enter Gemini API key'
          }
          style={inputStyle}
        />
        {/* Paid-plan warning — always visible, cannot be dismissed */}
        <div
          style={{
            fontSize: '11px',
            color: '#fbbf24',
            marginBottom: '8px',
            lineHeight: '1.4',
          }}
        >
          ⚠ Free tier allows training on your meeting data. A paid plan is required.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <button
            style={primaryButtonStyle}
            onClick={() => saveKey('gemini-api-key', geminiKeyInput, setGeminiKeyStatus)}
          >
            Save
          </button>
          {geminiKeyStatus === 'saved' && (
            <span style={{ color: '#4ade80', fontSize: '12px' }}>Saved</span>
          )}
          {geminiKeyStatus === 'error' && (
            <span style={{ color: '#f87171', fontSize: '12px' }}>Error</span>
          )}
        </div>

        {/* Deepgram API Key */}
        <div style={fieldLabelStyle}>Deepgram API Key</div>
        <input
          type="password"
          value={deepgramKeyInput}
          onChange={(e) => setDeepgramKeyInput(e.target.value)}
          placeholder={
            hasDeepgramKey ? 'Key saved — enter new key to replace' : 'Enter Deepgram API key'
          }
          style={inputStyle}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <button
            style={primaryButtonStyle}
            onClick={() =>
              saveKey('deepgram-api-key', deepgramKeyInput, setDeepgramKeyStatus)
            }
          >
            Save
          </button>
          {deepgramKeyStatus === 'saved' && (
            <span style={{ color: '#4ade80', fontSize: '12px' }}>Saved</span>
          )}
          {deepgramKeyStatus === 'error' && (
            <span style={{ color: '#f87171', fontSize: '12px' }}>Error</span>
          )}
        </div>

      </div>
    </div>
  )
}
