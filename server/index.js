import express from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

import { ROOT, getRepo, listRepos, loadConfig, saveConfig, makeId, DEFAULT_FLOW, DEFAULT_RULES } from './lib/config.js'
import { git } from './lib/exec.js'
import * as repoLib from './lib/repo.js'
import * as flow from './lib/gitflow.js'
import { buildGraph } from './lib/graph.js'
import { checkRules } from './lib/rules.js'
import * as gh from './lib/github.js'

// PORT 는 프론트엔드 dev 서버가 쓰는 경우가 있어 API 는 전용 변수를 쓴다.
const PORT = process.env.GITFLOW_API_PORT || 5178
const app = express()
app.use(express.json({ limit: '1mb' }))

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    res.status(err.status || 500).json({ error: err.message, detail: err.detail || null })
  })
}

/** :id 저장소를 로드해 req.repo 에 붙인다. */
async function withRepo(req) {
  const repo = await getRepo(req.params.id)
  if (!repo) throw Object.assign(new Error('등록되지 않은 저장소입니다'), { status: 404 })
  return repo
}

// ─── 설정 / 저장소 등록 ────────────────────────────────────────────────
app.get('/api/config', wrap(async (_req, res) => res.json(await loadConfig({ fresh: true }))))

app.put('/api/config', wrap(async (req, res) => {
  const cfg = await loadConfig()
  const next = {
    ...cfg,
    defaults: {
      flow: { ...DEFAULT_FLOW, ...(req.body.defaults?.flow || cfg.defaults.flow) },
      rules: { ...DEFAULT_RULES, ...(req.body.defaults?.rules || cfg.defaults.rules) },
    },
    repos: req.body.repos ?? cfg.repos,
  }
  res.json(await saveConfig(next))
}))

app.post('/api/repos', wrap(async (req, res) => {
  const dir = path.resolve(String(req.body.path || '').replace(/^~/, os.homedir()))
  const top = await repoLib.resolveWorktree(dir)
  if (!top) throw Object.assign(new Error(`git 저장소가 아닙니다: ${dir}`), { status: 400 })

  const cfg = await loadConfig()
  if (cfg.repos.some((r) => r.path === top)) throw Object.assign(new Error('이미 등록된 저장소입니다'), { status: 409 })

  let id = req.body.id || makeId(top)
  while (cfg.repos.some((r) => r.id === id)) id = `${id}-2`

  const entry = { id, name: req.body.name || path.basename(top), path: top }
  if (req.body.flow) entry.flow = req.body.flow
  await saveConfig({ ...cfg, repos: [...cfg.repos, entry] })
  res.status(201).json(await getRepo(id))
}))

app.patch('/api/repos/:id', wrap(async (req, res) => {
  const cfg = await loadConfig()
  const i = cfg.repos.findIndex((r) => r.id === req.params.id)
  if (i === -1) throw Object.assign(new Error('없는 저장소'), { status: 404 })
  const { name, flow: f, rules } = req.body
  cfg.repos[i] = {
    ...cfg.repos[i],
    ...(name ? { name } : {}),
    ...(f ? { flow: { ...cfg.repos[i].flow, ...f } } : {}),
    ...(rules ? { rules: { ...cfg.repos[i].rules, ...rules } } : {}),
  }
  await saveConfig(cfg)
  res.json(await getRepo(req.params.id))
}))

app.delete('/api/repos/:id', wrap(async (req, res) => {
  const cfg = await loadConfig()
  await saveConfig({ ...cfg, repos: cfg.repos.filter((r) => r.id !== req.params.id) })
  res.json({ ok: true })
}))

/** 디렉터리 하위의 git 저장소를 훑어 등록 후보를 돌려준다. */
app.post('/api/scan', wrap(async (req, res) => {
  const base = path.resolve(String(req.body.path || os.homedir()).replace(/^~/, os.homedir()))
  const depth = Math.min(Number(req.body.depth) || 2, 4)
  const cfg = await loadConfig()
  const known = new Set(cfg.repos.map((r) => r.path))
  const found = []

  async function walk(dir, level) {
    if (level > depth || found.length > 300) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((e) => e.name === '.git')) {
      found.push({ path: dir, name: path.basename(dir), registered: known.has(dir) })
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue
      await walk(path.join(dir, e.name), level + 1)
    }
  }
  await walk(base, 0)
  res.json({ base, found: found.sort((a, b) => a.name.localeCompare(b.name)) })
}))

// ─── 대시보드 ─────────────────────────────────────────────────────────
app.get('/api/dashboard', wrap(async (_req, res) => {
  const repos = await listRepos()
  res.json({ repos: await Promise.all(repos.map((r) => repoLib.summarize(r))) })
}))

// ─── 저장소 상세 ──────────────────────────────────────────────────────
app.get('/api/repos/:id', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const [summary, branches, tags, status, merge] = await Promise.all([
    repoLib.summarize(repo),
    repoLib.listBranches(repo.path),
    repoLib.listTags(repo.path),
    repoLib.isDirty(repo.path),
    repoLib.mergeState(repo.path),
  ])
  // classify 의 name(접두사 뗀 이름)이 브랜치 name 을 덮어쓰지 않도록 flowName 으로 담는다
  const flowBranches = branches.map((b) => {
    const c = repoLib.classify(b.name, repo.flow)
    return { ...b, type: c.type, flowName: c.name }
  })
  res.json({ repo: { id: repo.id, name: repo.name, path: repo.path, flow: repo.flow, rules: repo.rules }, summary, branches: flowBranches, tags, status, merge })
}))

/** 충돌로 멈춘 병합을 되돌린다. */
app.post('/api/repos/:id/merge/abort', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const r = await git(repo.path, ['merge', '--abort'])
  if (!r.ok) throw Object.assign(new Error(r.stderr), { status: 400 })
  res.json({ ok: true, log: [{ cmd: r.cmd, ok: true, stdout: r.stdout, stderr: r.stderr }] })
}))

app.post('/api/repos/:id/fetch', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const r = await git(repo.path, ['fetch', '--all', '--prune', '--tags'])
  res.json({ ok: r.ok, log: [{ cmd: r.cmd, ok: r.ok, stdout: r.stdout, stderr: r.stderr }] })
}))

app.post('/api/repos/:id/checkout', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const r = await git(repo.path, ['checkout', String(req.body.branch)])
  if (!r.ok) throw Object.assign(new Error(r.stderr), { status: 400 })
  res.json({ ok: true, log: [{ cmd: r.cmd, ok: true, stdout: r.stdout, stderr: r.stderr }] })
}))

app.post('/api/repos/:id/branches/:branch/delete', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const force = req.body.force ? '-D' : '-d'
  const r = await git(repo.path, ['branch', force, req.params.branch])
  if (!r.ok) throw Object.assign(new Error(r.stderr), { status: 400 })
  res.json({ ok: true, log: [{ cmd: r.cmd, ok: true, stdout: r.stdout, stderr: r.stderr }] })
}))

// ─── git-flow 동작 ────────────────────────────────────────────────────
app.post('/api/repos/:id/flow', wrap(async (req, res) => {
  const repo = await withRepo(req)
  if (req.body.dryRun) {
    const p = await flow.plan(repo, req.body)
    return res.json({ ...p, preview: p.steps.map((s) => s.join(' ')) })
  }
  res.json(await flow.execute(repo, req.body))
}))

app.post('/api/repos/:id/flow/init', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const p = await flow.planInit(repo, req.body)
  if (req.body.dryRun) return res.json({ ...p, preview: p.steps.map((s) => s.join(' ')) })
  const { runSteps } = await import('./lib/exec.js')
  res.json({ ...p, ...(await runSteps(repo.path, p.steps)) })
}))

// ─── 그래프 / 규칙 / GitHub ────────────────────────────────────────────
app.get('/api/repos/:id/graph', wrap(async (req, res) => {
  const repo = await withRepo(req)
  res.json(await buildGraph(repo.path, { limit: Number(req.query.limit) || 120, branch: req.query.branch || null }))
}))

app.get('/api/repos/:id/rules', wrap(async (req, res) => {
  const repo = await withRepo(req)
  res.json(await checkRules(repo))
}))

app.get('/api/repos/:id/github', wrap(async (req, res) => {
  const repo = await withRepo(req)
  const auth = await gh.ghAuth()
  if (!auth.available) return res.json({ auth, linked: false, prs: [] })
  const info = await gh.repoInfo(repo.path)
  if (!info.linked) return res.json({ auth, ...info, prs: [] })
  const prs = await gh.listPRs(repo.path, { state: req.query.state || 'open' })
  res.json({ auth, ...info, ...prs })
}))

app.post('/api/repos/:id/github/pr', wrap(async (req, res) => {
  const repo = await withRepo(req)
  res.json(await gh.createPR(repo.path, req.body))
}))

app.post('/api/repos/:id/github/notes', wrap(async (req, res) => {
  const repo = await withRepo(req)
  res.json(await gh.releaseNotes(repo.path, req.body))
}))

// 빌드된 프론트엔드 (npm run build 후 npm start 로 단독 실행할 때)
app.use(express.static(path.join(ROOT, 'dist')))

app.listen(PORT, '127.0.0.1', () => {
  console.log(`gitflow-manager API  http://localhost:${PORT}`)
})
