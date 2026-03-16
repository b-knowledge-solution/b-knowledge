/**
 * @fileoverview Results overlay for the embeddable search widget.
 * Shows AI-generated summary, source chunk cards, and related questions.
 *
 * @module features/search-widget/SearchWidgetResults
 */

// ============================================================================
// Types
// ============================================================================

/**
 * @description Shape of a search result chunk for the widget results display.
 */
interface ChunkData {
  /** Chunk unique identifier */
  chunk_id: string
  /** Text content */
  text: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name */
  doc_name: string
  /** Relevance score */
  score: number
}

/**
 * @description Props for the SearchWidgetResults component.
 */
interface SearchWidgetResultsProps {
  /** AI-generated answer (accumulated from SSE deltas) */
  answer: string
  /** Retrieved chunk results */
  chunks: ChunkData[]
  /** Related follow-up questions */
  relatedQuestions: string[]
  /** Whether the stream is still active */
  isStreaming: boolean
  /** Current pipeline status */
  pipelineStatus: string
  /** Callback to perform a follow-up search */
  onFollowUp: (query: string) => void
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * @description Renders a single source chunk card with document name, score, and text preview.
 * @param {{ chunk: ChunkData; index: number }} props - Chunk data and display index
 * @returns {JSX.Element} The rendered chunk card
 */
function ChunkCard({ chunk, index }: { chunk: ChunkData; index: number }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid var(--bk-sw-border, #e2e8f0)',
        backgroundColor: 'var(--bk-sw-card-bg, #f8fafc)',
        fontSize: '13px',
        lineHeight: '18px',
      }}
    >
      {/* Card header with doc name and score */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: 'var(--bk-sw-text, #1e293b)',
            fontSize: '12px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%',
          }}
          title={chunk.doc_name}
        >
          [{index + 1}] {chunk.doc_name}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--bk-sw-muted, #94a3b8)',
          }}
        >
          {(chunk.score * 100).toFixed(0)}%
        </span>
      </div>

      {/* Chunk text preview (truncated) */}
      <p
        style={{
          margin: 0,
          color: 'var(--bk-sw-text-secondary, #475569)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {chunk.text}
      </p>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description Results overlay showing AI-generated summary, source chunks, and related questions.
 * Only renders when there is content to display (answer, chunks, or active streaming).
 * @param {SearchWidgetResultsProps} props - Component props
 * @returns {JSX.Element | null} The rendered results overlay or null if no content
 */
export function SearchWidgetResults({
  answer,
  chunks,
  relatedQuestions,
  isStreaming,
  pipelineStatus,
  onFollowUp,
}: SearchWidgetResultsProps) {
  // Guard: don't render the overlay if there is no content and no active stream
  if (!answer && chunks.length === 0 && !isStreaming) {
    return null
  }

  return (
    <div
      className="bk-sw-results"
      style={{
        marginTop: '8px',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid var(--bk-sw-border, #e2e8f0)',
        backgroundColor: 'var(--bk-sw-bg, #ffffff)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        maxHeight: '480px',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Pipeline status indicator */}
      {isStreaming && pipelineStatus && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--bk-sw-muted, #94a3b8)',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Spinning indicator */}
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              border: '2px solid var(--bk-sw-muted, #94a3b8)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'bk-sw-spin 0.8s linear infinite',
            }}
          />
          {pipelineStatus.replace(/_/g, ' ')}
        </div>
      )}

      {/* AI Summary answer */}
      {(answer || isStreaming) && (
        <div
          style={{
            marginBottom: chunks.length > 0 ? '12px' : 0,
            fontSize: '14px',
            lineHeight: '22px',
            color: 'var(--bk-sw-text, #1e293b)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {answer}
          {isStreaming && (
            <span
              style={{
                display: 'inline-block',
                width: '2px',
                height: '14px',
                backgroundColor: 'var(--bk-sw-btn-bg, #0D26CF)',
                marginLeft: '2px',
                animation: 'bk-sw-blink 1s step-end infinite',
                verticalAlign: 'text-bottom',
              }}
            />
          )}
        </div>
      )}

      {/* Source chunks */}
      {chunks.length > 0 && (
        <div style={{ marginBottom: relatedQuestions.length > 0 ? '12px' : 0 }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--bk-sw-muted, #94a3b8)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Sources ({chunks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {chunks.slice(0, 5).map((chunk, i) => (
              <ChunkCard key={chunk.chunk_id || i} chunk={chunk} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Related questions */}
      {relatedQuestions.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--bk-sw-muted, #94a3b8)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Related
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {relatedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(q)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--bk-sw-border, #e2e8f0)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--bk-sw-link, #0D26CF)',
                  lineHeight: '18px',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline keyframe animations */}
      <style>{`
        @keyframes bk-sw-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bk-sw-blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
