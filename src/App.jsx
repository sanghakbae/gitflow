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
  const [navOpen, setNavOpen] = useState(false)
  const navigate = useNavigate()
  const closeNav = () => setNavOpen(false)

  const refresh = useCallback(async () => {
    try {
      const d = await api.dashboard()
      setRepos(d.repos)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
    // api 는 백엔드가 정해지면 고정된다 (BackendProvider 가 memo 로 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // refresh 는 await 이후에 setState 하므로 동기 setState 가 아니다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  return (
    <div className="app">
      {navOpen && <div className="nav-scrim" onClick={closeNav} />}

      <aside className={`sidebar ${navOpen ? 'open' : ''}`} onClick={closeNav}>
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

      {/* 모바일 하단 탭바 — 엄지가 닿는 위치에 둔다 */}
      <nav className="bottomnav">
        <NavLink to="/" end onClick={closeNav} className={({ isActive }) => `bn-item ${isActive && !navOpen ? 'active' : ''}`}>
          <span className="bn-icon">◧</span>
          대시보드
        </NavLink>
        <button className={`bn-item ${navOpen ? 'active' : ''}`} onClick={() => setNavOpen((v) => !v)}>
          <span className="bn-icon">⎇</span>
          저장소{repos.length ? ` ${repos.length}` : ''}
        </button>
        <NavLink to="/settings" onClick={closeNav} className={({ isActive }) => `bn-item ${isActive && !navOpen ? 'active' : ''}`}>
          <span className="bn-icon">⚙</span>
          설정
        </NavLink>
      </nav>
    </div>
  )
}
