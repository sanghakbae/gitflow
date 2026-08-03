import { useState } from 'react'
import { useBackend } from '../../backends/index.jsx'
import { Badge, relTime } from '../../components/ui.jsx'
import { useAsyncData } from '../../lib/useAsyncData.js'

const ROW = 30
const COL = 18
const PAD = 14
const COLORS = ['#4c8dff', '#3fb950', '#a371f7', '#d29922', '#db61a2', '#f85149', '#39c5cf', '#e3b341']

export default function GraphTab({ repoId, branches }) {
  const api = useBackend()
  const [limit, setLimit] = useState(120)
  const [scope, setScope] = useState('')
  const { data, error } = useAsyncData(
    () => api.graph(repoId, { limit, ...(scope ? { branch: scope } : {}) }),
    [repoId, limit, scope],
  )

  if (error) return <div className="card empty err-text">{error}</div>
  if (!data) return <div className="empty">그래프 계산 중…</div>
  if (!data.nodes.length) return <div className="card empty">커밋이 없습니다.</div>

  const width = PAD * 2 + Math.max(1, data.lanes) * COL
  const height = data.nodes.length * ROW

  const x = (lane) => PAD + lane * COL
  const y = (row) => row * ROW + ROW / 2
  const color = (lane) => COLORS[lane % COLORS.length]

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 240 }}>
          <option value="">모든 브랜치</option>
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 130 }}>
          {[50, 120, 250, 500].map((n) => (
            <option key={n} value={n}>
              최근 {n}개
            </option>
          ))}
        </select>
        <span className="muted">
          {data.nodes.length}개 커밋 · {data.lanes}개 레인
        </span>
      </div>

      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="graph-wrap">
          <svg width={width} height={height} style={{ flex: `0 0 ${width}px` }}>
            {data.edges.map((e, i) => {
              const x1 = x(e.fromLane)
              const y1 = y(e.fromRow)
              const x2 = x(e.toLane)
              const y2 = y(e.toRow)
              const d =
                x1 === x2
                  ? `M${x1},${y1} L${x2},${y2}`
                  : `M${x1},${y1} C${x1},${y1 + ROW * 0.6} ${x2},${y2 - ROW * 0.6} ${x2},${y2}`
              return <path key={i} d={d} fill="none" stroke={color(e.merge ? e.toLane : e.fromLane)} strokeWidth="1.6" opacity="0.85" />
            })}
            {data.nodes.map((n) => (
              <circle
                key={n.sha}
                cx={x(n.lane)}
                cy={y(n.row)}
                r={n.isMerge ? 3.6 : 4.6}
                fill={n.isMerge ? 'var(--bg)' : color(n.lane)}
                stroke={color(n.lane)}
                strokeWidth="2"
              />
            ))}
          </svg>

          <div className="graph-rows">
            {data.nodes.map((n) => (
              <div key={n.sha} className="graph-row">
                {n.refs.map((r) => (
                  <Badge key={r} kind={refKind(r)}>
                    {r}
                  </Badge>
                ))}
                <span className="subject">{n.subject}</span>
                <span className="meta mono">{n.short}</span>
                <span className="meta" style={{ width: 90, textAlign: 'right' }}>
                  {n.author?.split(' ')[0]}
                </span>
                <span className="meta" style={{ width: 70, textAlign: 'right' }}>
                  {relTime(n.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {data.truncated && <div className="muted" style={{ padding: '10px 4px 0' }}>표시 한도에 도달했습니다. 개수를 늘려 보세요.</div>}
      </div>
    </>
  )
}

function refKind(ref) {
  if (ref.startsWith('tag: ')) return 'release'
  if (ref === 'main' || ref === 'master' || ref === 'HEAD') return 'main'
  if (ref === 'develop') return 'develop'
  if (ref.includes('feature/')) return 'feature'
  if (ref.includes('hotfix/')) return 'hotfix'
  if (ref.includes('release/')) return 'release'
  return ''
}
