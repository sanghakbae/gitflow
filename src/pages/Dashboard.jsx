import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBackend } from '../backends/index.jsx'
import { Badge, relTime, useToast } from '../components/ui.jsx'

export default function Dashboard({ repos, refresh }) {
  const api = useBackend()
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState({})
  const [toast, showToast] = useToast()

  // 저장소별 규칙 위반 수를 뒤늦게 채운다 (카드 표시는 기다리지 않는다)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const r of repos) {
        if (!r.ok || rules[r.id]) continue
        try {
          const res = await api.rules(r.id)
          if (!cancelled) setRules((p) => ({ ...p, [r.id]: res.summary }))
        } catch {
          /* 무시 */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repos]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setBusy(true)
    try {
      await Promise.all(repos.filter((r) => r.ok && r.hasRemote).map((r) => api.fetch(r.id)))
      await refresh()
      showToast('모든 저장소 fetch 완료')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const total = repos.reduce(
    (a, r) => ({
      feature: a.feature + (r.counts?.feature || 0),
      release: a.release + (r.counts?.release || 0),
      hotfix: a.hotfix + (r.counts?.hotfix || 0),
      dirty: a.dirty + (r.dirty ? 1 : 0),
    }),
    { feature: 0, release: 0, hotfix: 0, dirty: 0 },
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <div className="sub">
            저장소 {repos.length}개 · 진행중 feature {total.feature} · release {total.release} · hotfix {total.hotfix}
            {total.dirty > 0 && ` · 미커밋 변경 있는 저장소 ${total.dirty}개`}
          </div>
        </div>
        <div className="row">
          <button onClick={refresh}>새로고침</button>
          {api.caps.workingTree && (
            <button className="primary" onClick={fetchAll} disabled={busy || !repos.length}>
              {busy ? 'fetch 중…' : '전체 fetch'}
            </button>
          )}
        </div>
      </div>

      {!repos.length ? (
        <div className="card empty">
          등록된 저장소가 없습니다. <Link to="/settings">설정</Link>에서 저장소를 추가하거나 폴더를 스캔하세요.
        </div>
      ) : (
        <div className="cards">
          {repos.map((r) => (
            <RepoCard key={r.id} repo={r} rules={rules[r.id]} />
          ))}
        </div>
      )}
      {toast}
    </>
  )
}

function RepoCard({ repo, rules }) {
  if (!repo.ok) {
    return (
      <div className="card">
        <div className="row">
          <strong>{repo.name}</strong>
          <Badge kind="err">오류</Badge>
        </div>
        <div className="sub" style={{ marginTop: 6 }}>{repo.error}</div>
        <div className="mono-sm" style={{ marginTop: 6 }}>{repo.path}</div>
      </div>
    )
  }

  return (
    <Link to={`/repo/${repo.id}`} style={{ color: 'inherit' }}>
      <div className="card click">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 15 }}>{repo.name}</strong>
          <div className="row" style={{ gap: 4 }}>
            {repo.dirty && <Badge kind="warn">변경 {repo.dirtyCount}</Badge>}
            {repo.ahead > 0 && <Badge>↑{repo.ahead}</Badge>}
            {repo.behind > 0 && <Badge>↓{repo.behind}</Badge>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <Badge kind={repo.branch === repo.flow?.main ? 'main' : repo.branch === repo.flow?.develop ? 'develop' : ''}>
            ⎇ {repo.branch}
          </Badge>
          {!repo.developExists && <Badge kind="warn">develop 없음</Badge>}
          {!repo.hasRemote && <Badge>로컬 전용</Badge>}
        </div>

        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          {repo.counts.feature > 0 && <Badge kind="feature">feature {repo.counts.feature}</Badge>}
          {repo.counts.release > 0 && <Badge kind="release">release {repo.counts.release}</Badge>}
          {repo.counts.hotfix > 0 && <Badge kind="hotfix">hotfix {repo.counts.hotfix}</Badge>}
          {rules?.error > 0 && <Badge kind="err">규칙 위반 {rules.error}</Badge>}
          {rules && rules.error === 0 && rules.warn > 0 && <Badge kind="warn">경고 {rules.warn}</Badge>}
          {rules && rules.error === 0 && rules.warn === 0 && <Badge kind="ok">규칙 통과</Badge>}
        </div>

        {repo.lastCommit && (
          <div className="mono-sm" style={{ marginTop: 10 }}>
            {repo.lastCommit.sha} {repo.lastCommit.subject?.slice(0, 46)}
            {(repo.lastCommit.subject?.length || 0) > 46 ? '…' : ''} · {relTime(repo.lastCommit.date)}
          </div>
        )}
      </div>
    </Link>
  )
}
