import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useBackend } from './backends/index.jsx'
import Dashboard from './pages/Dashboard.jsx'
import RepoDetail from './pages/RepoDetail.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const api = useBackend()
  const [repos, setRepos] = useState([])
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    try {
      const d = await api.dashboard()
      setRepos(d.repos)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          Git<span>Flow</span> Manager
        </div>
        <NavLink to="/" end className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}>
          <span>◧</span> 대시보드
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}>
          <span>⚙</span> 설정
        </NavLink>

        <div className="side-label">저장소 {repos.length ? `(${repos.length})` : ''}</div>
        {repos.map((r) => (
          <NavLink key={r.id} to={`/repo/${r.id}`} className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}>
            <span className={`dot ${!r.ok ? 'err' : r.dirty ? 'dirty' : 'clean'}`} />
            <span className="name">{r.name}</span>
          </NavLink>
        ))}
        {!repos.length && (
          <button className="side-item" onClick={() => navigate('/settings')}>
            + 저장소 추가
          </button>
        )}
        {error && <div className="side-label err-text">불러오기 실패: {error}</div>}

        <div className="side-foot">
          {api.mode === 'local' ? (
            <span className="badge ok">로컬 모드</span>
          ) : (
            <>
              <span className="badge">GitHub 모드</span>
              {api.user && (
                <button className="side-item" onClick={api.signOut} title={api.user.email || ''}>
                  <img src={api.user.photoURL} alt="" width="18" height="18" style={{ borderRadius: '50%' }} />
                  <span className="name">{api.user.displayName || api.user.email} · 로그아웃</span>
                </button>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard repos={repos} refresh={refresh} />} />
          <Route path="/repo/:id" element={<RepoDetail onChanged={refresh} />} />
          <Route path="/settings" element={<Settings onChanged={refresh} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
