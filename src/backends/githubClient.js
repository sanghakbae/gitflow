import { getStoredToken } from '../firebase.js'

const BASE = 'https://api.github.com'

export class GithubError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function call(pathname, { method = 'GET', body, accept } = {}) {
  const token = getStoredToken()
  if (!token) throw new GithubError('GitHub 인증이 필요합니다. 다시 로그인하세요.', 401)

  const res = await fetch(pathname.startsWith('http') ? pathname : `${BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = data?.message || res.statusText
    throw new GithubError(
      res.status === 401 ? 'GitHub 토큰이 만료되었습니다. 다시 로그인하세요.' : msg,
      res.status,
      data,
    )
  }
  return data
}

/** 링크 헤더를 따라가지 않고 per_page 한도 안에서만 조회한다. */
export const gh = {
  get: (p) => call(p),
  post: (p, body) => call(p, { method: 'POST', body }),
  patch: (p, body) => call(p, { method: 'PATCH', body }),
  put: (p, body) => call(p, { method: 'PUT', body }),
  del: (p) => call(p, { method: 'DELETE' }),
}

// ── 자주 쓰는 조회 ────────────────────────────────────────────────
export const viewer = () => gh.get('/user')
export const myRepos = (page = 1) =>
  gh.get(`/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page=${page}`)
export const searchRepos = (q) => gh.get(`/search/repositories?q=${encodeURIComponent(q)}&per_page=20`)

export const repoMeta = (o, r) => gh.get(`/repos/${o}/${r}`)
export const branches = (o, r) => gh.get(`/repos/${o}/${r}/branches?per_page=100`)
export const branchMeta = (o, r, b) => gh.get(`/repos/${o}/${r}/branches/${encodeURIComponent(b)}`)
export const tags = (o, r) => gh.get(`/repos/${o}/${r}/tags?per_page=30`)
export const commits = (o, r, params = {}) =>
  gh.get(`/repos/${o}/${r}/commits?${new URLSearchParams({ per_page: '100', ...params })}`)
export const compare = (o, r, base, head) =>
  gh.get(`/repos/${o}/${r}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`)
export const pulls = (o, r, state = 'open') =>
  gh.get(`/repos/${o}/${r}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`)

// ── 쓰기 ─────────────────────────────────────────────────────────
export const createRef = (o, r, ref, sha) => gh.post(`/repos/${o}/${r}/git/refs`, { ref: `refs/${ref}`, sha })
export const deleteRef = (o, r, ref) => gh.del(`/repos/${o}/${r}/git/refs/${ref}`)
export const mergeBranch = (o, r, base, head, commit_message) =>
  gh.post(`/repos/${o}/${r}/merges`, { base, head, commit_message })
export const createPull = (o, r, body) => gh.post(`/repos/${o}/${r}/pulls`, body)
export const createRelease = (o, r, body) => gh.post(`/repos/${o}/${r}/releases`, body)
export const generateNotes = (o, r, body) => gh.post(`/repos/${o}/${r}/releases/generate-notes`, body)
export const rateLimit = () => gh.get('/rate_limit')
