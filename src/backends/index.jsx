import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { githubBackend } from './github.js'
import { localAvailable, localBackend } from './local.js'
import {
  connectGithub,
  getStoredToken,
  isFirebaseConfigured,
  signInWithGithub,
  signOutGithub,
  watchAuth,
} from '../firebase.js'

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
        // Firebase 로그인은 유지되지만 토큰은 세션 스토리지에 있어 탭을 닫으면 사라진다.
        // 그 경우 재인증으로 토큰만 다시 받도록 연결 단계로 보낸다.
        if (!user) setState({ status: 'signed-out' })
        else if (!getStoredToken()) setState({ status: 'needs-github', user })
        else setState({ status: 'ready', backend: githubBackend, user })
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

  if (state.status === 'signed-out') return <SignIn />

  if (state.status === 'needs-github') {
    return <ConnectGithub user={state.user} onConnected={() => setState({ status: 'ready', backend: githubBackend, user: state.user })} />
  }

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
}

/** 로그인 팝업을 띄우고 결과/에러를 다루는 공통 로직 */
function useSignInAction() {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const run = async (key, fn) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      // 성공 시 onAuthStateChanged 가 다음 단계를 결정한다
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, run }
}

function SignIn() {
  const { busy, error, run } = useSignInAction()

  return (
    <div className="signin">
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div className="logo" style={{ fontSize: 20, padding: '0 0 6px' }}>
          Git<span>Flow</span> Manager
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          로그인하면 원격 저장소의 브랜치 라이프사이클을 관리할 수 있습니다.
        </p>
        <button
          className="primary"
          onClick={() => run('github', signInWithGithub)}
          disabled={!!busy}
          style={{ width: '100%', padding: '10px' }}
        >
          {busy === 'github' ? '로그인 중…' : 'GitHub 로 로그인'}
        </button>
        {error && <div className="err-text" style={{ marginTop: 12, fontSize: 12.5 }}>{error}</div>}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 14 }}>
          브랜치·태그 조작을 위해 <code>repo</code> 권한을 요청합니다. 액세스 토큰은 Firestore 에 저장하지 않고
          브라우저 세션에만 보관됩니다.
        </p>
      </div>
    </div>
  )
}

function ConnectGithub({ user, onConnected }) {
  const { busy, error, run } = useSignInAction()

  return (
    <div className="signin">
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <div className="logo" style={{ fontSize: 20, padding: '0 0 6px' }}>
          Git<span>Flow</span> Manager
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>{user.displayName || user.email}</strong> 으로 로그인했습니다.
          <br />
          저장소를 읽고 브랜치를 조작하려면 GitHub 연결이 필요합니다.
        </p>
        <button
          className="primary"
          onClick={() => run('connect', () => connectGithub().then(onConnected))}
          disabled={!!busy}
          style={{ width: '100%', padding: '10px' }}
        >
          {busy ? '연결 중…' : 'GitHub 연결하기'}
        </button>
        <button onClick={signOutGithub} disabled={!!busy} style={{ width: '100%', padding: '8px', marginTop: 8 }}>
          다른 계정으로 로그인
        </button>
        {error && <div className="err-text" style={{ marginTop: 12, fontSize: 12.5 }}>{error}</div>}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 14 }}>
          <code>repo</code> 권한을 요청합니다. 액세스 토큰은 Firestore 에 저장하지 않고 브라우저 세션에만 둡니다.
        </p>
      </div>
    </div>
  )
}

/** Firebase 인증 오류를 원인이 드러나는 한국어 문장으로 바꾼다. */
function friendly(e) {
  const code = e?.code || ''
  if (code === 'auth/unauthorized-domain')
    return `이 도메인(${location.hostname})이 Firebase 승인된 도메인 목록에 없습니다. Firebase 콘솔 → Authentication → Settings → 승인된 도메인에 추가하세요.`
  if (code === 'auth/operation-not-allowed')
    return 'Firebase 콘솔에서 해당 로그인 공급자가 아직 활성화되지 않았습니다.'
  if (code === 'auth/popup-blocked') return '브라우저가 팝업을 차단했습니다. 팝업을 허용한 뒤 다시 시도하세요.'
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '로그인 창이 닫혔습니다.'
  if (code === 'auth/account-exists-with-different-credential')
    return '같은 이메일로 다른 방식의 계정이 이미 있습니다. 먼저 그 방식으로 로그인한 뒤 GitHub 을 연결하세요.'
  if (code === 'auth/credential-already-in-use')
    return '이 GitHub 계정은 이미 다른 사용자에 연결되어 있습니다. GitHub 로그인으로 직접 들어오세요.'
  return e?.message || String(e)
}
