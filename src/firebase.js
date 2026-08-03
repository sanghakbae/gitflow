import { initializeApp } from 'firebase/app'
import { GithubAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
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

export async function signInWithGithub() {
  const provider = new GithubAuthProvider()
  provider.addScope('repo') // 비공개 저장소까지 읽고 브랜치를 조작하려면 필요
  provider.addScope('read:org')
  const result = await signInWithPopup(auth, provider)
  const credential = GithubAuthProvider.credentialFromResult(result)
  if (credential?.accessToken) sessionStorage.setItem(TOKEN_KEY, credential.accessToken)
  return { user: result.user, token: credential?.accessToken }
}

export async function signOutGithub() {
  clearStoredToken()
  if (auth) await signOut(auth)
}

export const watchAuth = (cb) => (auth ? onAuthStateChanged(auth, cb) : () => {})
