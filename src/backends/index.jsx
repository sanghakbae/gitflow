import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { githubBackend } from './github.js'
import { localAvailable, localBackend } from './local.js'
import { getStoredToken, isFirebaseConfigured, signInWithGithub, signOutGithub, watchAuth } from '../firebase.js'

const BackendContext = createContext(null)
export const useBackend = () => useContext(BackendContext)

/**
 * 백엔드 결정 규칙
 * - 로컬 API 서버가 응답하면 로컬 모드 (실제 git 조작)
 * - 아니면 GitHub API 모드 (Firebase Auth 로 로그인 후 원격 저장소 조작)
 */
export function BackendProvider({ children }) {
  const [state, setState] = useState({ status: 'probing' })
  // 컨텍스트 값이 매 렌더마다 새 객체가 되지 않도록 고정한다
  const value = useMemo(
    () => (state.backend ? { ...state.backend, user: state.user, signOut: signOutGithub } : null),
    [state.backend, state.user],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (await localAvailable()) {
        if (!cancelled) setState({ status: 'ready', backend: localBackend, user: null })
        return
      }
      if (!isFirebaseConfigured) {
        if (!cancelled) setState({ status: 'unconfigured' })
        return
      }
      watchAuth((user) => {
        if (cancelled) return
        if (user && getStoredToken()) setState({ status: 'ready', backend: githubBackend, user })
        else setState({ status: 'signed-out', user })
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'probing') return <div className="empty">연결 확인 중…</div>

  if (state.status === 'unconfigured') {
    return (
      <div className="signin">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>설정이 필요합니다</h2>
          <p className="muted">
            로컬 API 서버(<code>npm run dev</code>)가 떠 있지 않고, Firebase 환경변수도 없습니다.
            <br />
            로컬에서 쓰려면 서버를 실행하고, 배포판으로 쓰려면 <code>.env</code> 에 <code>VITE_FIREBASE_*</code> 값을 채우세요.
          </p>
        </div>
      </div>
    )
  }

  if (state.status === 'signed-out') {
    return <SignIn onSignedIn={(user) => setState({ status: 'ready', backend: githubBackend, user })} />
  }

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
}

function SignIn({ onSignedIn }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      const { user } = await signInWithGithub()
      onSignedIn(user)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div className="logo" style={{ fontSize: 20, padding: '0 0 6px' }}>
          Git<span>Flow</span> Manager
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          GitHub 계정으로 로그인하면 원격 저장소의 브랜치 라이프사이클을 관리할 수 있습니다.
        </p>
        <button className="primary" onClick={go} disabled={busy} style={{ width: '100%', padding: '10px' }}>
          {busy ? '로그인 중…' : 'GitHub 로 로그인'}
        </button>
        {error && <div className="err-text" style={{ marginTop: 12, fontSize: 12.5 }}>{error}</div>}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          브랜치·태그 조작을 위해 <code>repo</code> 권한을 요청합니다. 토큰은 브라우저 세션에만 보관됩니다.
        </p>
      </div>
    </div>
  )
}
