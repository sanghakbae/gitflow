import { useEffect, useState } from 'react'
import { useBackend } from '../../backends/index.jsx'
import { Badge, Modal, relTime } from '../../components/ui.jsx'

export default function PullRequestsTab({ repoId, data, showToast }) {
  const api = useBackend()
  const { repo, branches, summary } = data
  const [state, setState] = useState('open')
  const [gh, setGh] = useState(null)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [notes, setNotes] = useState(null)

  const load = () => {
    setGh(null)
    api.github(repoId, state).then(setGh).catch((e) => setError(e.message))
  }
  useEffect(load, [repoId, state]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="card empty err-text">{error}</div>
  if (!gh) return <div className="empty">GitHub 조회 중…</div>

  if (!gh.auth?.available) {
    return (
      <div className="card empty">
        GitHub CLI 인증이 필요합니다. 터미널에서 <code>gh auth login</code> 을 실행하세요.
      </div>
    )
  }
  if (!gh.linked) {
    return <div className="card empty">이 저장소는 GitHub 원격에 연결되어 있지 않습니다.{gh.error ? ` (${gh.error.split('\n')[0]})` : ''}</div>
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div className="row">
          <a href={gh.url} target="_blank" rel="noreferrer">
            {gh.nameWithOwner} ↗
          </a>
          <select value={state} onChange={(e) => setState(e.target.value)} style={{ width: 120 }}>
            <option value="open">열림</option>
            <option value="merged">병합됨</option>
            <option value="closed">닫힘</option>
            <option value="all">전체</option>
          </select>
        </div>
        <div className="row">
          <button onClick={() => setNotes({})}>릴리즈 노트 생성</button>
          <button className="primary" onClick={() => setCreating(true)}>
            + PR 생성
          </button>
        </div>
      </div>

      <div className="card">
        {!gh.prs?.length ? (
          <div className="empty">해당 상태의 PR 이 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>제목</th>
                <th style={{ width: 220 }}>브랜치</th>
                <th style={{ width: 130 }}>리뷰</th>
                <th style={{ width: 100 }}>업데이트</th>
              </tr>
            </thead>
            <tbody>
              {gh.prs.map((pr) => (
                <tr key={pr.number}>
                  <td className="mono-sm">#{pr.number}</td>
                  <td>
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      {pr.title}
                    </a>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      {pr.isDraft && <Badge>draft</Badge>}
                      {pr.state && <Badge kind={pr.state === 'MERGED' ? 'release' : pr.state === 'OPEN' ? 'ok' : ''}>{pr.state.toLowerCase()}</Badge>}
                      {pr.labels?.map((l) => (
                        <Badge key={l.name}>{l.name}</Badge>
                      ))}
                      {/* GitHub 의 PR 목록 API 는 증감 라인을 주지 않는다 (gh CLI 경로에서만 채워짐) */}
                      {(pr.additions > 0 || pr.deletions > 0) && (
                        <span className="mono-sm">
                          +{pr.additions} −{pr.deletions}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="mono-sm">
                    {pr.headRefName} → {pr.baseRefName}
                  </td>
                  <td>
                    {pr.reviewDecision === 'APPROVED' && <Badge kind="ok">승인됨</Badge>}
                    {pr.reviewDecision === 'CHANGES_REQUESTED' && <Badge kind="err">변경 요청</Badge>}
                    {pr.reviewDecision === 'REVIEW_REQUIRED' && <Badge kind="warn">리뷰 대기</Badge>}
                    {!pr.reviewDecision && <span className="muted">—</span>}
                  </td>
                  <td className="mono-sm">{relTime(pr.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CreatePRModal
          repoId={repoId}
          repo={repo}
          branches={branches}
          current={summary.branch}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            load()
          }}
          showToast={showToast}
        />
      )}
      {notes && <NotesModal repoId={repoId} data={data} onClose={() => setNotes(null)} showToast={showToast} />}
    </>
  )
}

function CreatePRModal({ repoId, repo, branches, current, onClose, onDone, showToast }) {
  const api = useBackend()
  const [head, setHead] = useState(current)
  const [base, setBase] = useState(guessBase(current, repo.flow))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)

  // head 를 바꾸면 git-flow 규칙에 맞는 base 를 자동 제안한다
  function pickHead(v) {
    setHead(v)
    setBase(guessBase(v, repo.flow))
    const b = branches.find((x) => x.name === v)
    if (b && !title) setTitle(b.subject || v)
  }

  async function submit() {
    setBusy(true)
    try {
      const r = await api.createPR(repoId, { head, base, title, body, draft })
      showToast(`PR 생성됨: ${r.url}`)
      onDone()
    } catch (e) {
      showToast(e.message.split('\n')[0], 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Pull Request 생성"
      onClose={onClose}
      wide
      actions={
        <>
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={submit} disabled={busy || !title || head === base}>
            {busy ? '생성 중…' : '생성'}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div className="field grow">
          <label>head (작업 브랜치)</label>
          <select value={head} onChange={(e) => pickHead(e.target.value)}>
            {branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ paddingBottom: 8 }}>→</div>
        <div className="field grow">
          <label>base (병합 대상)</label>
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            {branches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>제목</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="feat: 소셜 로그인 추가" />
      </div>
      <div className="field">
        <label>본문</label>
        <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> 초안(draft)으로 생성
      </label>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        head 브랜치가 원격에 push 되어 있어야 합니다.
      </p>
    </Modal>
  )
}

function NotesModal({ repoId, data, onClose, showToast }) {
  const api = useBackend()
  const { tags, repo } = data
  const [base, setBase] = useState(tags[1]?.name || tags[0]?.name || '')
  const [head, setHead] = useState(tags[0]?.name || repo.flow.main)
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const r = await api.releaseNotes(repoId, { base, head })
      if (!r.ok) throw new Error(r.error)
      setOut(r)
    } catch (e) {
      showToast(e.message.split('\n')[0], 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="릴리즈 노트 생성"
      onClose={onClose}
      wide
      actions={
        <>
          <button onClick={onClose}>닫기</button>
          {out && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(out.body)
                showToast('클립보드에 복사했습니다')
              }}
            >
              복사
            </button>
          )}
          <button className="primary" onClick={generate} disabled={busy || !head}>
            {busy ? '생성 중…' : '생성'}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12 }}>
        <div className="field grow">
          <label>이전 태그</label>
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">(자동)</option>
            {tags.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>대상 태그</label>
          <input value={head} onChange={(e) => setHead(e.target.value)} />
        </div>
      </div>
      {out && (
        <>
          <div className="field">
            <label>{out.name}</label>
            <textarea rows={14} readOnly value={out.body} />
          </div>
        </>
      )}
      <p className="muted" style={{ fontSize: 12.5 }}>GitHub 의 자동 생성 노트 API 를 사용합니다. 태그가 원격에 push 되어 있어야 합니다.</p>
    </Modal>
  )
}

function guessBase(head, flow) {
  if (head?.startsWith(flow.prefixes.feature)) return flow.develop
  if (head?.startsWith(flow.prefixes.release) || head?.startsWith(flow.prefixes.hotfix)) return flow.main
  return flow.develop
}
