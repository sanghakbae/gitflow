import { initializeApp } from 'firebase/app'
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const env = import.meta.env

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

// GitHub OAuth 액세스 토큰은 로그인 순간에만 내려온다. 새로고침 후에도 쓰려면
// 세션 스토리지에 보관한다(탭을 닫으면 사라짐). 만료되면 다시 로그인하면 된다.
const TOKEN_KEY = 'gitflow.gh_token'

export const getStoredToken = () => sessionStorage.getItem(TOKEN_KEY)
export const clearStoredToken = () => sessionStorage.removeItem(TOKEN_KEY)

function githubProvider() {
  const provider = new GithubAuthProvider()
  provider.addScope('repo') // 비공개 저장소까지 읽고 브랜치를 조작하려면 필요
  provider.addScope('read:org')
  return provider
}

const keepToken = (result) => {
  const credential = GithubAuthProvider.credentialFromResult(result)
  if (credential?.accessToken) sessionStorage.setItem(TOKEN_KEY, credential.accessToken)
  return credential?.accessToken
}

export async function signInWithGithub() {
  const result = await signInWithPopup(auth, githubProvider())
  return { user: result.user, token: keepToken(result) }
}

/** 신원 확인만 한다. GitHub 토큰은 연결 단계에서 따로 받는다. */
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider())
  return { user: result.user }
}

/**
 * 개인 액세스 토큰(PAT)을 직접 등록한다.
 * Firebase 의 GitHub 공급자를 설정하지 않아도 이 경로로 저장소를 다룰 수 있다.
 * 유효성을 GitHub 에 물어보고, 통과한 것만 세션에 보관한다.
 */
export async function useManualToken(token) {
  const trimmed = (token || '').trim()
  if (!trimmed) throw new Error('토큰을 입력하세요')

  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${trimmed}`, Accept: 'application/vnd.github+json' },
  })
  if (res.status === 401) throw new Error('GitHub 이 거부한 토큰입니다. 값과 만료일을 확인하세요.')
  if (!res.ok) throw new Error(`GitHub 확인 실패 (${res.status})`)

  const login = (await res.json()).login
  // 저장소 조작에 필요한 권한이 있는지 헤더로 확인 (fine-grained 토큰은 이 헤더가 비어 있다)
  const scopes = res.headers.get('x-oauth-scopes')
  sessionStorage.setItem(TOKEN_KEY, trimmed)
  return { login, scopes }
}

/**
 * 로그인한 계정에 GitHub 을 연결해 액세스 토큰을 받는다.
 * 이미 연결되어 있으면 재인증으로 토큰만 새로 받아온다.
 */
export async function connectGithub() {
  const user = auth.currentUser
  if (!user) throw new Error('먼저 로그인하세요')
  const linked = user.providerData.some((p) => p.providerId === 'github.com')
  const result = linked
    ? await reauthenticateWithPopup(user, githubProvider())
    : await linkWithPopup(user, githubProvider())
  const token = keepToken(result)
  if (!token) throw new Error('GitHub 액세스 토큰을 받지 못했습니다')
  return token
}

export async function signOutGithub() {
  clearStoredToken()
  if (auth) await signOut(auth)
}

export const watchAuth = (cb) => (auth ? onAuthStateChanged(auth, cb) : () => {})
