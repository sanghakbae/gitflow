async function request(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { data })
  return data
}

const get = (url) => request(url)
const post = (url, body) => request(url, { method: 'POST', body })
const patch = (url, body) => request(url, { method: 'PATCH', body })
const put = (url, body) => request(url, { method: 'PUT', body })
const del = (url) => request(url, { method: 'DELETE' })

export const api = {
  config: () => get('/api/config'),
  saveConfig: (cfg) => put('/api/config', cfg),
  dashboard: () => get('/api/dashboard'),
  scan: (path, depth) => post('/api/scan', { path, depth }),
  addRepo: (body) => post('/api/repos', body),
  updateRepo: (id, body) => patch(`/api/repos/${id}`, body),
  removeRepo: (id) => del(`/api/repos/${id}`),

  repo: (id) => get(`/api/repos/${id}`),
  fetch: (id) => post(`/api/repos/${id}/fetch`),
  checkout: (id, branch) => post(`/api/repos/${id}/checkout`, { branch }),
  deleteBranch: (id, branch, force) => post(`/api/repos/${id}/branches/${encodeURIComponent(branch)}/delete`, { force }),

  abortMerge: (id) => post(`/api/repos/${id}/merge/abort`),

  flow: (id, body) => post(`/api/repos/${id}/flow`, body),
  flowInit: (id, body) => post(`/api/repos/${id}/flow/init`, body),

  graph: (id, params = {}) => get(`/api/repos/${id}/graph?${new URLSearchParams(params)}`),
  rules: (id) => get(`/api/repos/${id}/rules`),
  github: (id, state = 'open') => get(`/api/repos/${id}/github?state=${state}`),
  createPR: (id, body) => post(`/api/repos/${id}/github/pr`, body),
  releaseNotes: (id, body) => post(`/api/repos/${id}/github/notes`, body),
}
