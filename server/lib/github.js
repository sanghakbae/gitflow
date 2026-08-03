import { gh } from './exec.js'

let authCache = null

export async function ghAuth() {
  if (authCache) return authCache
  const r = await gh(process.cwd(), ['auth', 'status'])
  authCache = { available: r.ok, message: r.stderr || r.stdout }
  return authCache
}

export async function repoInfo(cwd) {
  const r = await gh(cwd, ['repo', 'view', '--json', 'nameWithOwner,url,defaultBranchRef'])
  if (!r.ok) return { linked: false, error: r.stderr }
  const data = JSON.parse(r.stdout)
  return { linked: true, nameWithOwner: data.nameWithOwner, url: data.url, defaultBranch: data.defaultBranchRef?.name }
}

export async function listPRs(cwd, { state = 'open', limit = 30 } = {}) {
  const fields = 'number,title,state,isDraft,headRefName,baseRefName,author,createdAt,updatedAt,url,reviewDecision,mergeable,labels,additions,deletions'
  const r = await gh(cwd, ['pr', 'list', '--state', state, '--limit', String(limit), '--json', fields])
  if (!r.ok) return { ok: false, error: r.stderr, prs: [] }
  return { ok: true, prs: JSON.parse(r.stdout || '[]') }
}

export async function createPR(cwd, { head, base, title, body = '', draft = false }) {
  const args = ['pr', 'create', '--head', head, '--base', base, '--title', title, '--body', body]
  if (draft) args.push('--draft')
  const r = await gh(cwd, args)
  if (!r.ok) {
    const e = new Error(r.stderr || 'PR 생성 실패')
    e.status = 400
    throw e
  }
  return { url: r.stdout.split('\n').pop(), log: r.stdout }
}

export async function releaseNotes(cwd, { base, head }) {
  const r = await gh(cwd, ['api', '--method', 'POST', 'repos/{owner}/{repo}/releases/generate-notes',
    '-f', `tag_name=${head}`, '-f', `previous_tag_name=${base}`])
  if (!r.ok) return { ok: false, error: r.stderr }
  const data = JSON.parse(r.stdout)
  return { ok: true, name: data.name, body: data.body }
}
