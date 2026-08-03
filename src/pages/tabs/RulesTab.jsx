import { useState } from 'react'
import { useBackend } from '../../backends/index.jsx'
import { Badge } from '../../components/ui.jsx'
import { ruleLabel } from '../../lib/ruleCatalog.js'
import { useAsyncData } from '../../lib/useAsyncData.js'


const SEV_ORDER = { error: 0, warn: 1, info: 2 }
const SEV_LABEL = { error: '위반', warn: '경고', info: '참고' }

export default function RulesTab({ repoId }) {
  const api = useBackend()
  const [filter, setFilter] = useState('all')
  const { data, error } = useAsyncData(() => api.rules(repoId), [repoId])

  if (error) return <div className="card empty err-text">{error}</div>
  if (!data) return <div className="empty">규칙 검사 중…</div>

  const groups = {}
  for (const v of data.violations) {
    if (filter !== 'all' && v.severity !== filter) continue
    ;(groups[v.rule] ||= []).push(v)
  }
  const ruleKeys = Object.keys(groups).sort(
    (a, b) => SEV_ORDER[groups[a][0].severity] - SEV_ORDER[groups[b][0].severity],
  )

  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 6 }}>
          <Badge kind="err">위반 {data.summary.error}</Badge>
          <Badge kind="warn">경고 {data.summary.warn}</Badge>
          <Badge kind="info">참고 {data.summary.info}</Badge>
          <span className="muted">브랜치 {data.checkedBranches}개 검사</span>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}>
          <option value="all">전체</option>
          <option value="error">위반만</option>
          <option value="warn">경고만</option>
          <option value="info">참고만</option>
        </select>
      </div>

      {!ruleKeys.length ? (
        <div className="card empty">표시할 항목이 없습니다. 👍</div>
      ) : (
        ruleKeys.map((rule) => (
          <div className="card" key={rule} style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{ruleLabel(rule)}</h2>
              <Badge kind={groups[rule][0].severity === 'error' ? 'err' : groups[rule][0].severity}>
                {SEV_LABEL[groups[rule][0].severity]} {groups[rule].length}
              </Badge>
            </div>
            {/* 무엇이 걸렸는지만 보여주면 규칙을 고치는 대신 규칙을 끄게 된다 */}
            {groups[rule][0].why && <p className="why">{groups[rule][0].why}</p>}
            <table>
              <tbody>
                {groups[rule].map((v, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ width: 260 }}>{v.branch}</td>
                    <td>{v.message}</td>
                    <td className="mono-sm" style={{ width: 320 }}>{v.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  )
}
