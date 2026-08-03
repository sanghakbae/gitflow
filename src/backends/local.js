import { api } from '../api.js'

/** 로컬 Node 서버(server/)를 통해 실제 git 명령을 실행하는 백엔드. */
export const localBackend = {
  mode: 'local',
  caps: { checkout: true, scan: true, workingTree: true, publish: true, localPath: true },

  config: api.config,
  saveConfig: api.saveConfig,
  dashboard: api.dashboard,
  scan: api.scan,
  addRepo: api.addRepo,
  updateRepo: api.updateRepo,
  removeRepo: api.removeRepo,

  repo: api.repo,
  fetch: api.fetch,
  checkout: api.checkout,
  deleteBranch: api.deleteBranch,
  abortMerge: api.abortMerge,

  flow: api.flow,
  flowInit: api.flowInit,

  graph: api.graph,
  rules: api.rules,
  github: api.github,
  createPR: api.createPR,
  releaseNotes: api.releaseNotes,
}

/**
 * 로컬 API 서버가 떠 있는지 확인한다.
 * 정적 호스팅은 SPA 폴백으로 아무 경로에나 index.html 을 200 으로 돌려주므로,
 * 상태 코드만 보지 말고 응답이 실제 설정 JSON 인지까지 확인한다.
 */
export async function localAvailable() {
  try {
    const res = await fetch('/api/config', { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return false
    if (!(res.headers.get('content-type') || '').includes('application/json')) return false
    const data = await res.json()
    return Array.isArray(data?.repos)
  } catch {
    return false
  }
}
