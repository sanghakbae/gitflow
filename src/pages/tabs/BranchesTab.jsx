import { useState } from 'react'
import { useBackend } from '../../backends/index.jsx'
import { Badge, ExecLog, Modal, relTime } from '../../components/ui.jsx'

const ORDER = { main: 0, develop: 1, hotfix: 2, release: 3, feature: 4, support: 5, other: 6 }

export default function BranchesTab({ data, reload, showToast }) {
  const api = useBackend()
  const { repo, summary, branches } = data
  const [dialog, setDialog] = useState(null) // { action, type, name?, version? }
  const [confirmDelete, setConfirmDelete] = useState(null)

  const sorted = [...branches].sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) || a.name.localeCompare(b.name))

  async function checkout(branch) {
    try {
      await api.checkout(repo.id, branch)
      await reload()
      showToast(`${branch} 로 전환했습니다`)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function removeBranch(branch, force) {
    try {
      await api.deleteBranch(repo.id, branch, force)
      setConfirmDelete(null)
      await reload()
      showToast(`${branch} 삭제 완료`)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>git-flow 동작</h2>
        {!summary.developExists ? (
          <div className="row">
            <span className="muted">
              {repo.flow.develop} 브랜치가 없습니다. git-flow 를 사용하려면 먼저 초기화하세요.
            </span>
            <button className="primary" onClick={() => setDialog({ action: 'init' })}>
              git-flow 초기화
            </button>
          </div>
        ) : (
          <div className="row">
            <button onClick={() => setDialog({ action: 'start', type: 'feature' })}>+ feature 시작</button>
            <button onClick={() => setDialog({ action: 'start', type: 'release' })}>+ release 시작</button>
            <button onClick={() => setDialog({ action: 'start', type: 'hotfix' })}>+ hotfix 시작</button>
          </div>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>종류</th>
              <th>브랜치</th>
              <th style={{ width: 90 }}>동기화</th>
              <th style={{ width: 130 }}>마지막 커밋</th>
              <th style={{ width: 300 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.name}>
                <td>
                  <Badge kind={b.type}>{b.type}</Badge>
                </td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="mono" style={{ color: b.current ? 'var(--accent)' : undefined }}>
                      {b.current ? '● ' : ''}
                      {b.name}
                    </span>
                    {b.gone && <Badge kind="warn">원격 삭제됨</Badge>}
                  </div>
                  <div className="mono-sm">
                    {b.sha} {b.subject?.slice(0, 60)}
                  </div>
                </td>
                <td className="mono-sm" data-label="동기화">
                  {!b.upstream ? '로컬' : `${b.ahead ? `↑${b.ahead}` : ''}${b.behind ? ` ↓${b.behind}` : ''}` || '동기'}
                </td>
                <td className="mono-sm" data-label="마지막">{relTime(b.date)}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {api.caps.checkout && !b.current && (
                      <button className="sm" onClick={() => checkout(b.name)}>
                        checkout
                      </button>
                    )}
                    {['feature', 'release', 'hotfix'].includes(b.type) && (
                      <>
                        <button
                          className="sm primary"
                          onClick={() => setDialog({ action: 'finish', type: b.type, name: b.flowName })}
                        >
                          finish
                        </button>
                        {api.caps.publish && !b.upstream && summary.hasRemote && (
                          <button
                            className="sm"
                            onClick={() => setDialog({ action: 'publish', type: b.type, name: b.flowName })}
                          >
                            publish
                          </button>
                        )}
                      </>
                    )}
                    {!b.current && b.type !== 'main' && b.type !== 'develop' && (
                      <button className="sm danger" onClick={() => setConfirmDelete(b)}>
                        삭제
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <FlowDialog repo={repo} summary={summary} dialog={dialog} onClose={() => setDialog(null)} onDone={reload} showToast={showToast} />
      )}

      {confirmDelete && (
        <Modal
          title={`브랜치 삭제: ${confirmDelete.name}`}
          onClose={() => setConfirmDelete(null)}
          actions={
            <>
              <button onClick={() => setConfirmDelete(null)}>취소</button>
              <button onClick={() => removeBranch(confirmDelete.name, false)}>삭제 (-d)</button>
              <button className="danger" onClick={() => removeBranch(confirmDelete.name, true)}>
                강제 삭제 (-D)
              </button>
            </>
          }
        >
          <p className="muted">
            병합되지 않은 커밋이 있으면 <code>-d</code> 는 실패합니다. 강제 삭제는 되돌릴 수 없습니다.
          </p>
        </Modal>
      )}
    </>
  )
}

function FlowDialog({ repo, summary, dialog, onClose, onDone, showToast }) {
  const api = useBackend()
  const { action, type } = dialog
  const [name, setName] = useState(dialog.name || '')
  const [version, setVersion] = useState(dialog.name || '')
  const [push, setPush] = useState(false)
  const [deleteBranch, setDeleteBranch] = useState(true)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const isInit = action === 'init'
  const needsVersion = action === 'finish' && (type === 'release' || type === 'hotfix')
  const title = isInit
    ? 'git-flow 초기화'
    : `${type} ${action === 'start' ? '시작' : action === 'finish' ? '완료' : '게시'}`

  const body = { action, type, name, version: version || name, push, deleteBranch }

  async function loadPreview() {
    setBusy(true)
    setResult(null)
    try {
      const p = isInit
        ? await api.flowInit(repo.id, { push, dryRun: true })
        : await api.flow(repo.id, { ...body, dryRun: true })
      setPreview(p)
    } catch (e) {
      setPreview(null)
      showToast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function execute() {
    setBusy(true)
    try {
      const r = isInit ? await api.flowInit(repo.id, { push }) : await api.flow(repo.id, body)
      setResult(r)
      if (r.ok) {
        showToast(`${title} 완료`)
        await onDone()
      } else {
        showToast('실행 중 실패했습니다. 로그를 확인하세요.', 'error')
      }
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      actions={
        <>
          <button onClick={onClose}>닫기</button>
          <button onClick={loadPreview} disabled={busy || (!isInit && !name)}>
            실행 계획 보기
          </button>
          <button className="primary" onClick={execute} disabled={busy || (!isInit && !name) || (result?.ok === true)}>
            {busy ? '실행 중…' : '실행'}
          </button>
        </>
      }
    >
      {!isInit && (
        <div className="field">
          <label>{type} 이름</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'feature' ? 'login-oauth' : '1.4.0'}
            disabled={action !== 'start'}
          />
          <div className="mono-sm" style={{ marginTop: 4 }}>
            → {repo.flow.prefixes[type]}
            {name || '…'}
          </div>
        </div>
      )}

      {needsVersion && (
        <div className="field">
          <label>태그 버전</label>
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" />
          <div className="mono-sm" style={{ marginTop: 4 }}>
            → 태그 {repo.flow.tagPrefix}
            {version || '…'}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 16 }}>
        {api.caps.workingTree && (
          <label className="checkbox">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} disabled={!summary.hasRemote} />
            원격(origin) pull/push 포함
          </label>
        )}
        {action === 'finish' && (
          <label className="checkbox">
            <input type="checkbox" checked={deleteBranch} onChange={(e) => setDeleteBranch(e.target.checked)} />
            완료 후 브랜치 삭제
          </label>
        )}
      </div>

      {action === 'finish' && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          {type === 'feature'
            ? `${repo.flow.develop} 로 --no-ff 병합합니다.`
            : `${repo.flow.main} 병합 → 태그 → ${repo.flow.develop} 역병합 순으로 진행합니다.`}
          {api.caps.workingTree
            ? ' 충돌이 나면 중간에 멈추고 로그를 보여줍니다.'
            : ' 충돌이 나면 GitHub 가 병합을 거부합니다. 그 경우 PR 을 만들어 해결하세요.'}
        </p>
      )}

      {(preview || result) && <ExecLog result={result || preview} />}
    </Modal>
  )
}
