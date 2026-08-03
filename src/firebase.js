import { initializeApp } from 'firebase/app'
import {
  GithubAuthProvider,
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
