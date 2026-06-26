import React, { useState } from 'react'
import { ArtifactItem } from './ArtifactItem'

interface ActionItemData {
  id: string
  description: string
  assignee_label: string | null
  due_date: string | null
  raw_deadline_text: string | null
  status: string
  citations: Array<{
    quote_preview: string
    quote_full: string
    speaker_label: string
    timestamp_start: number | null
    timestamp_end: number | null
    confidence: 'direct' | 'inferred'
  }>
}

interface KeyPointData {
  text: string
  speaker_label: string | null
  source_quote_preview: string
  confidence: 'direct' | 'inferred'
}

interface ArtifactReviewProps {
  meetingId: string
  artifacts: {
    mom: { markdown_content: string }
    summary: { summary_text: string }
    keyPoints: { key_points: KeyPointData[] }
    actionItems: { action_items: ActionItemData[] }
    error?: boolean
    errorMessage?: string
  }
}

type Section = 'mom' | 'summary' | 'keyPoints' | 'actionItems'

export function ArtifactReview({ meetingId, artifacts }: ArtifactReviewProps): React.JSX.Element {
  const [expandedSection, setExpandedSection] = useState<Section | null>('actionItems')
  const [dismissedItems, setDismissedItems] = useState<Set<string>>(new Set())
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set())
  const [exportResult, setExportResult] = useState<{ filePath: string | null; skippedCount: number } | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const toggleSection = (section: Section) => {
    setExpandedSection((prev) => (prev === section ? null : section))
  }

  const handleConfirm = (id: string) => {
    window.electronAPI.invoke('confirm-artifact', { id, type: 'action_item' }).catch(console.error)
    setConfirmedItems((prev) => new Set([...prev, id]))
  }

  const handleDismiss = (id: string) => {
    window.electronAPI.invoke('dismiss-artifact', { id, type: 'action_item' }).catch(console.error)
    setDismissedItems((prev) => new Set([...prev, id]))
  }

  const handleEdit = (id: string, updates: { description?: string }) => {
    window.electronAPI.invoke('edit-artifact', { id, type: 'action_item', updates }).catch(console.error)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await window.electronAPI.invoke('export-ics', { meetingId }) as { filePath: string | null; skippedCount: number }
      setExportResult(result)
    } catch (err) {
      console.error('[ArtifactReview] export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const sectionHeaderStyle = (isOpen: boolean): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    background: isOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
    borderBottom: '1px solid #1f2937',
    userSelect: 'none',
  })

  if (artifacts.error) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid #dc2626',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '12px',
          fontSize: '12px',
          color: '#fca5a5',
        }}>
          {artifacts.errorMessage ?? 'Artifact generation failed — your transcript is saved'}
        </div>
        <button
          onClick={() => window.electronAPI.invoke('start-meeting').catch(console.error)}
          style={{ width: '100%', padding: '8px 0', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, marginBottom: '8px' }}
        >
          Start New Meeting
        </button>
        <button
          onClick={() => window.electronAPI.invoke('dismiss-session').catch(console.error)}
          style={{ width: '100%', padding: '8px 0', backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Meeting Artifacts</div>
      </div>

      {/* Action Items */}
      <div>
        <div style={sectionHeaderStyle(expandedSection === 'actionItems')} onClick={() => toggleSection('actionItems')}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>
            Action Items ({artifacts.actionItems.action_items.length})
          </span>
          <span style={{ color: '#6b7280', fontSize: '11px' }}>{expandedSection === 'actionItems' ? '▼' : '▶'}</span>
        </div>
        {expandedSection === 'actionItems' && (
          <div style={{ padding: '8px 16px' }}>
            {artifacts.actionItems.action_items
              .filter((item) => !dismissedItems.has(item.id))
              .map((item) => {
                const subtextParts = [
                  item.assignee_label ? `Owner: ${item.assignee_label}` : null,
                  item.due_date
                    ? `Due: ${item.due_date}`
                    : item.raw_deadline_text
                    ? `Due: ${item.raw_deadline_text} (unresolved)`
                    : null,
                ].filter(Boolean)
                return (
                  <div key={item.id} style={{ opacity: confirmedItems.has(item.id) ? 0.6 : 1 }}>
                    {confirmedItems.has(item.id) && (
                      <div style={{ fontSize: '10px', color: '#34d399', marginTop: '6px', marginBottom: '2px' }}>✓ Confirmed</div>
                    )}
                    <ArtifactItem
                      id={item.id}
                      text={item.description}
                      subtext={subtextParts.join(' | ') || undefined}
                      citations={item.citations}
                      artifactType="action_item"
                      onConfirm={confirmedItems.has(item.id) ? () => {} : handleConfirm}
                      onDismiss={confirmedItems.has(item.id) ? () => {} : handleDismiss}
                      onEdit={handleEdit}
                    />
                  </div>
                )
              })}
            {artifacts.actionItems.action_items.filter((i) => !dismissedItems.has(i.id)).length === 0 && (
              <div style={{ fontSize: '12px', color: '#6b7280', padding: '8px 0' }}>No action items</div>
            )}
            {confirmedItems.size > 0 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  style={{
                    width: '100%',
                    padding: '7px 0',
                    backgroundColor: isExporting ? '#1e3a5f' : '#1d4ed8',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: isExporting ? 'default' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {isExporting ? 'Exporting...' : 'Export to Calendar (.ics)'}
                </button>
                {exportResult && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                    {exportResult.filePath
                      ? `Saved: ${exportResult.filePath.split('/').pop()}`
                      : 'Export cancelled'}
                    {exportResult.skippedCount > 0 && ` (${exportResult.skippedCount} items skipped — no due date)`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div>
        <div style={sectionHeaderStyle(expandedSection === 'summary')} onClick={() => toggleSection('summary')}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>Summary</span>
          <span style={{ color: '#6b7280', fontSize: '11px' }}>{expandedSection === 'summary' ? '▼' : '▶'}</span>
        </div>
        {expandedSection === 'summary' && (
          <div style={{ padding: '8px 16px' }}>
            <p style={{ fontSize: '12px', color: '#d1d5db', margin: 0, lineHeight: '1.5' }}>
              {artifacts.summary.summary_text || 'No summary generated.'}
            </p>
          </div>
        )}
      </div>

      {/* Key Points */}
      <div>
        <div style={sectionHeaderStyle(expandedSection === 'keyPoints')} onClick={() => toggleSection('keyPoints')}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>
            Key Points ({artifacts.keyPoints.key_points.length})
          </span>
          <span style={{ color: '#6b7280', fontSize: '11px' }}>{expandedSection === 'keyPoints' ? '▼' : '▶'}</span>
        </div>
        {expandedSection === 'keyPoints' && (
          <div style={{ padding: '8px 16px' }}>
            {artifacts.keyPoints.key_points.map((kp, idx) => (
              <ArtifactItem
                key={idx}
                id={`kp-${idx}`}
                text={kp.text}
                citations={[{
                  quote_preview: kp.source_quote_preview,
                  quote_full: kp.source_quote_preview,
                  speaker_label: kp.speaker_label ?? 'Unknown',
                  timestamp_start: null,
                  timestamp_end: null,
                  confidence: kp.confidence,
                }]}
                artifactType="key_point"
                onConfirm={() => {}}
                onDismiss={() => {}}
                onEdit={() => {}}
              />
            ))}
            {artifacts.keyPoints.key_points.length === 0 && (
              <div style={{ fontSize: '12px', color: '#6b7280', padding: '8px 0' }}>No key points extracted.</div>
            )}
          </div>
        )}
      </div>

      {/* MOM */}
      <div>
        <div style={sectionHeaderStyle(expandedSection === 'mom')} onClick={() => toggleSection('mom')}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>Minutes of Meeting</span>
          <span style={{ color: '#6b7280', fontSize: '11px' }}>{expandedSection === 'mom' ? '▼' : '▶'}</span>
        </div>
        {expandedSection === 'mom' && (
          <div style={{ padding: '8px 16px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', color: '#d1d5db', margin: 0, lineHeight: '1.5' }}>
              {artifacts.mom.markdown_content || 'No minutes generated.'}
            </pre>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1f2937', marginTop: '8px' }}>
        <button
          onClick={() => window.electronAPI.invoke('start-meeting').catch(console.error)}
          style={{ width: '100%', padding: '8px 0', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, marginBottom: '8px' }}
        >
          Start New Meeting
        </button>
        <button
          onClick={() => window.electronAPI.invoke('dismiss-session').catch(console.error)}
          style={{ width: '100%', padding: '8px 0', backgroundColor: 'transparent', color: '#9ca3af', border: '1px solid #374151', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
