import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase.js'

export const DEFAULT_FLOW = {
  main: 'main',
  develop: 'develop',
  prefixes: { feature: 'feature/', release: 'release/', hotfix: 'hotfix/', support: 'support/' },
  tagPrefix: 'v',
}

export const DEFAULT_RULES = {
  branchName: '^(feature|release|hotfix|support)/[a-z0-9][a-z0-9._-]*$',
  commitMessage: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\([^)]+\\))?!?: .{1,}',
  protectedBranches: ['main', 'master', 'develop'],
  staleDays: 30,
  maxCommitsChecked: 30,
}

const uid = () => {
  const u = auth?.currentUser?.uid
  if (!u) throw new Error('로그인이 필요합니다')
  return u
}

const reposCol = () => collection(db, 'users', uid(), 'repos')
const defaultsDoc = () => doc(db, 'users', uid(), 'settings', 'defaults')

// 백엔드 메서드마다 resolve() 가 등록부를 다시 읽는다. 화면 한 번 그리는 데
// Firestore 읽기가 수십 번 발생하므로 짧게 캐시하고, 쓰기 때 버린다.
let registryCache = null
const REGISTRY_TTL = 15_000

export const invalidateRegistry = () => {
  registryCache = null
}

export async function loadRegistry() {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL) return registryCache.value

  const [snap, defaults] = await Promise.all([getDocs(reposCol()), loadDefaults()])
  const repos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  repos.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const value = { repos, defaults }
  registryCache = { at: Date.now(), value }
  return value
}

export async function loadDefaults() {
  const snap = await getDoc(defaultsDoc())
  const data = snap.exists() ? snap.data() : {}
  return {
    flow: { ...DEFAULT_FLOW, ...(data.flow || {}), prefixes: { ...DEFAULT_FLOW.prefixes, ...(data.flow?.prefixes || {}) } },
    rules: { ...DEFAULT_RULES, ...(data.rules || {}) },
  }
}

export async function saveDefaults(defaults) {
  await setDoc(defaultsDoc(), { flow: defaults.flow, rules: defaults.rules }, { merge: true })
  invalidateRegistry()
  return defaults
}

/** Firestore 는 undefined 값을 거부하므로 저장 전에 걷어낸다. */
function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? stripUndefined(v) : v]),
  )
}

export async function saveRepoDoc(entry) {
  const { id, ...rest } = entry
  await setDoc(doc(reposCol(), id), stripUndefined(rest), { merge: true })
  invalidateRegistry()
  return entry
}

export async function removeRepoDoc(id) {
  await deleteDoc(doc(reposCol(), id))
  invalidateRegistry()
  return { ok: true }
}
