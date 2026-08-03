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

export async function loadRegistry() {
  const [snap, defaults] = await Promise.all([getDocs(reposCol()), loadDefaults()])
  const repos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  repos.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  return { repos, defaults }
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
  return defaults
}

export async function saveRepoDoc(entry) {
  const { id, ...rest } = entry
  await setDoc(doc(reposCol(), id), rest, { merge: true })
  return entry
}

export async function removeRepoDoc(id) {
  await deleteDoc(doc(reposCol(), id))
  return { ok: true }
}
