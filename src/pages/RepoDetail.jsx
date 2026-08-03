import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useBackend } from '../backends/index.jsx'
import { Badge, useToast } from '../components/ui.jsx'
import BranchesTab from './tabs/BranchesTab.jsx'
import GuideTab from './tabs/GuideTab.jsx'
import GraphTab from './tabs/GraphTab.jsx'
import PullRequestsTab from './tabs/PullRequestsTab.jsx'
import RulesTab from './tabs/RulesTab.jsx'

const TABS = [
  ['guide', '가이드'],
  ['branches', '브랜치'],
  ['graph', '그래프'],
  ['prs', 'Pull Request'],
  ['rules', '규칙 검사'],
]

export default function RepoDetail({ onChanged }) {
  const api = useBackend()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  const load = useCallback(async () => {
    try {
      setData(await api.repo(id))
      setError(null)
    } catch (e) {
      setError(e.message)
      setData(null)
    }
  }, [id])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const reload = useCallback(async () => {
    await load()
    onChanged?.()
  }, [load, onChanged])

  async function doFetch() {
    setBusy(true)
    try {
      await api.fetch(id)
      await reload()
      showToast('fetch 완료')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="card empty err-text">{error}</div>
  if (!data) return <div className="empty">불러오는 중…</div>

  const { repo, summary, branches, tags, status, merge } = data

  // develop 이 없는 저장소는 무엇부터 해야 하는지가 먼저다
  const tab = params.get('tab') || (summary.developExists ? 'branches' : 'guide')

  async function abortMerge() {
    try {
      await api.abortMerge(id)
      await reload()
      showToast('병합을 되돌렸습니다')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{repo.name}</h1>
          <div className="sub mono">{repo.path}</div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <Badge kind="main">main: {repo.flow.main}</Badge>
            <Badge kind="develop">develop: {repo.flow.develop}</Badge>
            <Badge>현재 ⎇ {summary.branch}</Badge>
            {api.caps.workingTree &&
              (status.dirty ? <Badge kind="warn">미커밋 {status.files.length}</Badge> : <Badge kind="ok">clean</Badge>)}
            {tags[0] && <Badge>최신 태그 {tags[0].name}</Badge>}
          </div>
        </div>
        <div className="row">
          <button onClick={reload}>새로고침</button>
          {api.caps.workingTree && (
            <button className="primary" onClick={doFetch} disabled={busy || !summary.hasRemote}>
              {busy ? 'fetch 중…' : 'fetch'}
            </button>
          )}
        </div>
      </div>

      {merge?.inProgress && (
        <div className="card banner" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong className="err-text">병합이 충돌로 멈춰 있습니다</strong>
              <div className="sub" style={{ marginTop: 4 }}>
                충돌 파일 {merge.conflicts.length}개 — 에디터에서 해결 후 <code>git commit</code> 하거나, 아래 버튼으로 되돌리세요.
              </div>
              <div className="mono-sm" style={{ marginTop: 6 }}>{merge.conflicts.join('  ·  ')}</div>
            </div>
            <button className="danger" onClick={abortMerge}>
              merge --abort
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setParams({ tab: key })}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'guide' && <GuideTab data={data} onGoBranches={() => setParams({ tab: 'branches' })} />}
      {tab === 'branches' && <BranchesTab data={data} reload={reload} showToast={showToast} />}
      {tab === 'graph' && <GraphTab repoId={id} branches={branches} />}
      {tab === 'prs' && <PullRequestsTab repoId={id} data={data} showToast={showToast} />}
      {tab === 'rules' && <RulesTab repoId={id} />}
      {toast}
    </>
  )
}
