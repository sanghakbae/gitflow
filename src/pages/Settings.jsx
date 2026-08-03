import { useEffect, useState } from 'react'
import { useBackend } from '../backends/index.jsx'
import { Badge, Modal, useToast } from '../components/ui.jsx'

export default function Settings({ onChanged }) {
  const api = useBackend()
  const [cfg, setCfg] = useState(null)
  const [scanPath, setScanPath] = useState('~/Tools')
  const [scan, setScan] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [addPath, setAddPath] = useState('')
  const [editing, setEditing] = useState(null)
  const [toast, showToast] = useToast()

  const load = () => api.config().then(setCfg).catch((e) => showToast(e.message, 'error'))
  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 로컬 모드는 경로 문자열, GitHub 모드는 {owner, repo} 를 받는다
  async function addRepo(target) {
    try {
      await api.addRepo(typeof target === 'string' ? { path: target } : target)
      setAddPath('')
      await load()
      onChanged?.()
      showToast('저장소를 추가했습니다')
      if (scan) runScan(scanPath)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  async function removeRepo(id) {
    await api.removeRepo(id)
    await load()
    onChanged?.()
  }

  async function runScan(p) {
    setScanning(true)
    try {
      setScan(await api.scan(p, 2))
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setScanning(false)
    }
  }

  async function saveDefaults(next) {
    setCfg(await api.saveConfig({ ...cfg, defaults: next }))
    onChanged?.()
    showToast('기본 설정을 저장했습니다')
  }

  if (!cfg) return <div className="empty">불러오는 중…</div>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>설정</h1>
          <div className="sub">저장소 등록과 팀 규칙 기본값을 관리합니다.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>등록된 저장소 ({cfg.repos.length})</h2>
        {!cfg.repos.length ? (
          <div className="empty">
            {api.caps.localPath
              ? '아직 없습니다. 아래에서 경로를 직접 추가하거나 폴더를 스캔하세요.'
              : '아직 없습니다. 아래에서 GitHub 저장소 목록을 불러와 추가하세요.'}
          </div>
        ) : (
          <table>
            <tbody>
              {cfg.repos.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 200 }}>
                    <strong>{r.name}</strong>
                    <div className="mono-sm">{r.id}</div>
                  </td>
                  <td className="mono-sm">{r.path || `${r.owner}/${r.repo}`}</td>
                  <td style={{ width: 200 }} className="mono-sm">
                    {r.flow?.main || cfg.defaults.flow.main} / {r.flow?.develop || cfg.defaults.flow.develop}
                  </td>
                  <td style={{ width: 150 }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="sm" onClick={() => setEditing(r)}>
                        편집
                      </button>
                      <button className="sm danger" onClick={() => removeRepo(r.id)}>
                        제거
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {api.caps.localPath && (
          <div className="row" style={{ marginTop: 14 }}>
            <input
              className="grow"
              placeholder="/Users/me/projects/my-repo  (또는 ~/projects/my-repo)"
              value={addPath}
              onChange={(e) => setAddPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPath && addRepo(addPath)}
            />
            <button className="primary" onClick={() => addRepo(addPath)} disabled={!addPath}>
              추가
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{api.caps.scan ? '폴더 스캔' : '내 GitHub 저장소'}</h2>
        <div className="row">
          {api.caps.scan && <input className="grow" value={scanPath} onChange={(e) => setScanPath(e.target.value)} />}
          <button onClick={() => runScan(scanPath)} disabled={scanning}>
            {scanning ? '불러오는 중…' : api.caps.scan ? '스캔 (깊이 2)' : '저장소 목록 불러오기'}
          </button>
        </div>
        {scan && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {scan.found.map((f) => (
                <tr key={f.path}>
                  <td style={{ width: 220 }}>
                    {f.name} {f.private && <Badge>private</Badge>}
                  </td>
                  <td className="mono-sm">{f.path}</td>
                  <td style={{ width: 110 }}>
                    {f.registered ? (
                      <Badge kind="ok">등록됨</Badge>
                    ) : (
                      <button className="sm" onClick={() => addRepo(f.owner ? { owner: f.owner, repo: f.repo } : f.path)}>
                        추가
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!scan.found.length && (
                <tr>
                  <td className="muted">저장소를 찾지 못했습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <DefaultsCard defaults={cfg.defaults} onSave={saveDefaults} />

      {editing && (
        <RepoEditModal
          repo={editing}
          defaults={cfg.defaults}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
            onChanged?.()
            showToast('저장했습니다')
          }}
        />
      )}
      {toast}
    </>
  )
}

function DefaultsCard({ defaults, onSave }) {
  const [flow, setFlow] = useState(defaults.flow)
  const [rules, setRules] = useState(defaults.rules)

  return (
    <div className="card">
      <h2>기본값 (저장소별 설정이 없으면 적용)</h2>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="field">
            <label>메인 브랜치</label>
            <input value={flow.main} onChange={(e) => setFlow({ ...flow, main: e.target.value })} />
          </div>
          <div className="field">
            <label>개발 브랜치</label>
            <input value={flow.develop} onChange={(e) => setFlow({ ...flow, develop: e.target.value })} />
          </div>
          <div className="field">
            <label>태그 접두사</label>
            <input value={flow.tagPrefix} onChange={(e) => setFlow({ ...flow, tagPrefix: e.target.value })} />
          </div>
          {Object.keys(flow.prefixes).map((k) => (
            <div className="field" key={k}>
              <label>{k} 접두사</label>
              <input
                value={flow.prefixes[k]}
                onChange={(e) => setFlow({ ...flow, prefixes: { ...flow.prefixes, [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>
        <div className="grow">
          <div className="field">
            <label>브랜치명 정규식</label>
            <input value={rules.branchName} onChange={(e) => setRules({ ...rules, branchName: e.target.value })} />
          </div>
          <div className="field">
            <label>커밋 메시지 정규식</label>
            <input value={rules.commitMessage} onChange={(e) => setRules({ ...rules, commitMessage: e.target.value })} />
          </div>
          <div className="field">
            <label>보호 브랜치 (쉼표 구분)</label>
            <input
              value={rules.protectedBranches.join(', ')}
              onChange={(e) => setRules({ ...rules, protectedBranches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
          <div className="field">
            <label>방치 기준 (일)</label>
            <input
              type="number"
              value={rules.staleDays}
              onChange={(e) => setRules({ ...rules, staleDays: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>브랜치당 검사할 최대 커밋 수</label>
            <input
              type="number"
              value={rules.maxCommitsChecked}
              onChange={(e) => setRules({ ...rules, maxCommitsChecked: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="primary" onClick={() => onSave({ flow, rules })}>
          기본값 저장
        </button>
      </div>
    </div>
  )
}

function RepoEditModal({ repo, defaults, onClose, onSaved }) {
  const api = useBackend()
  const [name, setName] = useState(repo.name)
  const [main, setMain] = useState(repo.flow?.main || defaults.flow.main)
  const [develop, setDevelop] = useState(repo.flow?.develop || defaults.flow.develop)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api.updateRepo(repo.id, { name, flow: { main, develop } })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`저장소 편집: ${repo.id}`}
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={save} disabled={busy}>
            저장
          </button>
        </>
      }
    >
      <div className="field">
        <label>표시 이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>메인 브랜치</label>
        <input value={main} onChange={(e) => setMain(e.target.value)} />
      </div>
      <div className="field">
        <label>개발 브랜치</label>
        <input value={develop} onChange={(e) => setDevelop(e.target.value)} />
      </div>
      <div className="mono-sm">{repo.path}</div>
    </Modal>
  )
}
