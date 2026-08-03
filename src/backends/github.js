import {
  branches as ghBranches,
  commits as ghCommits,
  compare,
  createPull,
  createRef,
  createRelease,
  deleteRef,
  gh,
  generateNotes,
  mergeBranch,
  myRepos,
  pulls,
  repoMeta,
  tags as ghTags,
} from './githubClient.js'
import { layoutLanes } from '../lib/laneLayout.js'
import { loadRegistry, saveRepoDoc, removeRepoDoc, saveDefaults } from './registry.js'

const DAY = 24 * 60 * 60 * 1000

/**
 * 규칙마다 "왜 문제인지"를 붙인다. 위반 목록만 보여주면 사람은 규칙을 지키는
 * 대신 규칙을 끄기 때문에, 근거가 화면에 함께 나와야 한다.
 * (server/lib/rules.js 의 RULE_REASONS 와 같은 내용을 유지한다)
 */
const RULE_REASONS = {
  'branch-name':
    '이름만으로 무슨 작업인지, 어디로 병합될지 알 수 없습니다. 이 도구를 포함한 자동화가 접두사로 브랜치 종류를 판별하므로, 규칙을 벗어난 브랜치는 feature/release/hotfix 어디에도 잡히지 않고 집계에서 빠집니다.',
  'commit-message':
    '릴리즈 노트 자동 생성과 변경 유형(기능/버그/문서) 분류가 커밋 접두사에 의존합니다. 규칙을 벗어난 커밋은 노트에서 누락되거나 엉뚱한 항목으로 분류되고, 나중에 "언제 무엇이 바뀌었나"를 되짚기 어려워집니다.',
  'stale-branch':
    '오래 방치될수록 기준 브랜치와 멀어져 병합 시 충돌이 커집니다. 이미 다른 경로로 반영됐는데 지우지 않은 브랜치일 수도 있어, 남아 있으면 어떤 작업이 살아 있는지 판단이 흐려집니다.',
  protected:
    'GitHub 브랜치 보호가 걸려 있으면 이 도구의 직접 병합·삭제가 거부될 수 있습니다. 그 브랜치로는 PR 을 거쳐야 합니다.',
}

const withReason = (v) => ({ ...v, why: RULE_REASONS[v.rule] || '' })
const truncate = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '')

function classify(name, flow) {
  for (const [type, prefix] of Object.entries(flow.prefixes)) {
    if (prefix && name.startsWith(prefix)) return { type, flowName: name.slice(prefix.length) }
  }
  if (name === flow.main) return { type: 'main', flowName: name }
  if (name === flow.develop) return { type: 'develop', flowName: name }
  return { type: 'other', flowName: name }
}

/** 등록된 저장소 하나를 기본값과 합쳐 돌려준다. */
async function resolve(id) {
  const { repos, defaults } = await loadRegistry()
  const r = repos.find((x) => x.id === id)
  if (!r) throw new Error('등록되지 않은 저장소입니다')
  return {
    ...r,
    flow: { ...defaults.flow, ...(r.flow || {}), prefixes: { ...defaults.flow.prefixes, ...(r.flow?.prefixes || {}) } },
    rules: { ...defaults.rules, ...(r.rules || {}) },
  }
}

/**
 * 브랜치마다 커밋을 한 번씩 조회하므로 요청 수가 브랜치 수만큼 늘어난다.
 * 대시보드·상세·규칙검사가 같은 데이터를 연달아 요청하므로 짧게 캐시해
 * GitHub API 사용량을 아낀다.
 */
const CACHE_TTL = 20_000
const cache = new Map()

async function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

/** 쓰기 작업 뒤에는 그 저장소의 캐시를 버려야 화면이 최신 상태를 보여준다. */
function invalidate(owner, name) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${owner}/${name}:`)) cache.delete(key)
  }
}

const meta_ = (o, r) => cached(`${o}/${r}:meta`, () => repoMeta(o, r))

/** 브랜치 목록 + 각 브랜치 최신 커밋 메타 (날짜·작성자·메시지) */
const branchesWithCommits = (repo) =>
  cached(`${repo.owner}/${repo.repo}:branches`, () => fetchBranchesWithCommits(repo))

async function fetchBranchesWithCommits(repo) {
  const { owner, repo: name } = repo
  const list = await ghBranches(owner, name)
  const detailed = await Promise.all(
    list.slice(0, 60).map(async (b) => {
      try {
        const c = await gh.get(`/repos/${owner}/${name}/commits/${b.commit.sha}`)
        return {
          name: b.name,
          sha: b.commit.sha.slice(0, 7),
          fullSha: b.commit.sha,
          date: c.commit.committer?.date || c.commit.author?.date,
          author: c.commit.author?.name,
          subject: (c.commit.message || '').split('\n')[0],
          protected: b.protected,
        }
      } catch {
        return { name: b.name, sha: b.commit.sha.slice(0, 7), fullSha: b.commit.sha, date: null, author: null, subject: '' }
      }
    }),
  )
  return detailed.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
}

function summarizeBranches(list, flow, meta) {
  const counts = { feature: 0, release: 0, hotfix: 0, support: 0, other: 0 }
  for (const b of list) {
    const c = classify(b.name, flow)
    if (c.type in counts) counts[c.type] += 1
  }
  const head = list.find((b) => b.name === (meta?.default_branch || flow.main)) || list[0]
  return {
    counts,
    branchCount: list.length,
    developExists: list.some((b) => b.name === flow.develop),
    mainExists: list.some((b) => b.name === flow.main),
    lastCommit: head ? { sha: head.sha, subject: head.subject, date: head.date, author: head.author } : null,
  }
}

export const githubBackend = {
  mode: 'github',
  caps: { checkout: false, scan: false, workingTree: false, publish: false, localPath: false },

  async config() {
    const { repos, defaults } = await loadRegistry()
    return { repos, defaults }
  },
  async saveConfig(cfg) {
    await saveDefaults(cfg.defaults)
    return this.config()
  },
  async addRepo({ owner, repo, name, id }) {
    const [meta, { repos }] = await Promise.all([repoMeta(owner, repo), loadRegistry()])
    if (repos.some((r) => r.owner === owner && r.repo === repo)) throw new Error('이미 등록된 저장소입니다')

    let entryId = id || `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'repo'
    while (repos.some((r) => r.id === entryId)) entryId = `${entryId}-2`

    const entry = {
      id: entryId,
      name: name || meta.name,
      owner,
      repo,
      url: meta.html_url,
      flow: { main: meta.default_branch },
    }
    await saveRepoDoc(entry)
    return entry
  },
  async updateRepo(id, body) {
    const { repos } = await loadRegistry()
    const cur = repos.find((r) => r.id === id)
    if (!cur) throw new Error('없는 저장소')
    const next = { ...cur, ...body, flow: { ...(cur.flow || {}), ...(body.flow || {}) } }
    await saveRepoDoc(next)
    return next
  },
  removeRepo: (id) => removeRepoDoc(id),

  /** 등록 후보: 내 GitHub 저장소 목록 */
  async scan() {
    const [mine, { repos }] = await Promise.all([myRepos(), loadRegistry()])
    const known = new Set(repos.map((r) => `${r.owner}/${r.repo}`))
    return {
      base: 'GitHub',
      found: mine.map((m) => ({
        path: m.full_name,
        name: m.name,
        owner: m.owner.login,
        repo: m.name,
        private: m.private,
        registered: known.has(m.full_name),
      })),
    }
  },

  async dashboard() {
    const { repos, defaults } = await loadRegistry()
    const out = await Promise.all(
      repos.map(async (r) => {
        const flow = { ...defaults.flow, ...(r.flow || {}), prefixes: { ...defaults.flow.prefixes, ...(r.flow?.prefixes || {}) } }
        try {
          const [meta, list] = await Promise.all([meta_(r.owner, r.repo), branchesWithCommits({ ...r })])
          return {
            id: r.id,
            name: r.name,
            path: `${r.owner}/${r.repo}`,
            flow,
            ok: true,
            branch: meta.default_branch,
            dirty: false,
            dirtyCount: 0,
            ahead: 0,
            behind: 0,
            hasRemote: true,
            openIssues: meta.open_issues_count,
            ...summarizeBranches(list, flow, meta),
          }
        } catch (e) {
          return { id: r.id, name: r.name, path: `${r.owner}/${r.repo}`, ok: false, error: e.message }
        }
      }),
    )
    return { repos: out }
  },

  async repo(id) {
    const repo = await resolve(id)
    const [meta, list, tagList] = await Promise.all([
      meta_(repo.owner, repo.repo),
      branchesWithCommits(repo),
      ghTags(repo.owner, repo.repo),
    ])

    // main 대비 ahead/behind 를 gitflow 브랜치에만 계산한다 (요청 수 절약)
    const flowBranches = await Promise.all(
      list.map(async (b) => {
        const c = classify(b.name, repo.flow)
        const base = c.type === 'feature' ? repo.flow.develop : repo.flow.main
        let ahead = 0
        let behind = 0
        if (['feature', 'release', 'hotfix'].includes(c.type)) {
          try {
            const cmp = await compare(repo.owner, repo.repo, base, b.name)
            ahead = cmp.ahead_by
            behind = cmp.behind_by
          } catch {
            /* 비교 불가 시 0 */
          }
        }
        return { ...b, ...c, upstream: `origin/${b.name}`, ahead, behind, gone: false, current: b.name === meta.default_branch }
      }),
    )

    return {
      repo: { id: repo.id, name: repo.name, path: `${repo.owner}/${repo.repo}`, url: meta.html_url, flow: repo.flow, rules: repo.rules },
      summary: {
        ...summarizeBranches(list, repo.flow, meta),
        id: repo.id,
        branch: meta.default_branch,
        dirty: false,
        hasRemote: true,
        flow: repo.flow,
      },
      branches: flowBranches,
      tags: tagList.map((t) => ({ name: t.name, date: null })),
      status: { dirty: false, files: [] },
      merge: { inProgress: false, conflicts: [] },
    }
  },

  // 원격 기준이라 받아올 것은 없지만, 새로고침 의도이므로 캐시는 비운다
  async fetch(id) {
    const repo = await resolve(id)
    invalidate(repo.owner, repo.repo)
    return { ok: true, log: [] }
  },
  checkout: async () => {
    throw new Error('GitHub 모드에서는 체크아웃할 수 없습니다')
  },
  abortMerge: async () => {
    throw new Error('GitHub 모드에서는 병합 중단 상태가 없습니다')
  },

  async deleteBranch(id, branch) {
    const repo = await resolve(id)
    await deleteRef(repo.owner, repo.repo, `heads/${branch}`)
    invalidate(repo.owner, repo.repo)
    return { ok: true, log: [{ cmd: `DELETE refs/heads/${branch}`, ok: true, stdout: '삭제됨' }] }
  },

  async flowInit(id, { dryRun }) {
    const repo = await resolve(id)
    const steps = [`refs/heads/${repo.flow.develop} 생성 (${repo.flow.main} 기준)`]
    if (dryRun) return { title: 'git-flow 초기화', steps: [], preview: steps }
    const base = await gh.get(`/repos/${repo.owner}/${repo.repo}/git/ref/heads/${repo.flow.main}`)
    await createRef(repo.owner, repo.repo, `heads/${repo.flow.develop}`, base.object.sha)
    invalidate(repo.owner, repo.repo)
    return { title: 'git-flow 초기화', ok: true, log: [{ cmd: steps[0], ok: true, stdout: '생성됨' }] }
  },

  async flow(id, body) {
    const repo = await resolve(id)
    const { action, type, name, version, deleteBranch = true, dryRun } = body
    const flow = repo.flow
    const branch = `${flow.prefixes[type]}${name}`
    const tag = type === 'release' || type === 'hotfix' ? `${flow.tagPrefix}${version || name}` : null
    const o = repo.owner
    const r = repo.repo

    if (action === 'start') {
      const base = type === 'hotfix' || type === 'support' ? flow.main : flow.develop
      const preview = [`refs/heads/${branch} 생성 (${base} 기준)`]
      if (dryRun) return { title: `${type} 시작 → ${branch}`, steps: [], preview }
      const ref = await gh.get(`/repos/${o}/${r}/git/ref/heads/${base}`)
      await createRef(o, r, `heads/${branch}`, ref.object.sha)
      invalidate(o, r)
      return { title: `${type} 시작 → ${branch}`, ok: true, log: [{ cmd: preview[0], ok: true, stdout: '생성됨' }] }
    }

    if (action === 'finish') {
      const targets = type === 'feature' ? [flow.develop] : [flow.main, flow.develop]
      const preview = [
        ...targets.map((t) => `${branch} → ${t} 병합 (POST /merges)`),
        ...(tag ? [`릴리즈 ${tag} 생성 (${flow.main} 기준, 노트 자동 생성)`] : []),
        ...(deleteBranch ? [`refs/heads/${branch} 삭제`] : []),
      ]
      if (dryRun) return { title: `${type} 완료 → ${branch}`, steps: [], preview, tag }

      const log = []
      const done = (result) => {
        invalidate(o, r) // 실패로 중단하더라도 일부는 반영됐을 수 있다
        return result
      }
      for (const t of targets) {
        try {
          const res = await mergeBranch(o, r, t, branch, `Merge branch '${branch}' into ${t}`)
          log.push({ cmd: `${branch} → ${t} 병합`, ok: true, stdout: res ? `커밋 ${res.sha?.slice(0, 7)}` : '변경 없음 (이미 최신)' })
        } catch (e) {
          const conflict = e.status === 409
          log.push({
            cmd: `${branch} → ${t} 병합`,
            ok: false,
            stderr: conflict ? `충돌이 발생했습니다. GitHub 에서 PR 로 해결하세요: ${e.message}` : e.message,
          })
          return done({ title: `${type} 완료 → ${branch}`, ok: false, log })
        }
      }

      if (tag) {
        try {
          await createRelease(o, r, { tag_name: tag, target_commitish: flow.main, name: tag, generate_release_notes: true })
          log.push({ cmd: `릴리즈 ${tag} 생성`, ok: true, stdout: '생성됨' })
        } catch (e) {
          log.push({ cmd: `릴리즈 ${tag} 생성`, ok: false, stderr: e.message })
          return done({ title: `${type} 완료 → ${branch}`, ok: false, log })
        }
      }

      if (deleteBranch) {
        try {
          await deleteRef(o, r, `heads/${branch}`)
          log.push({ cmd: `refs/heads/${branch} 삭제`, ok: true, stdout: '삭제됨' })
        } catch (e) {
          log.push({ cmd: `refs/heads/${branch} 삭제`, ok: false, stderr: e.message })
        }
      }
      return done({ title: `${type} 완료 → ${branch}`, ok: true, log, tag })
    }

    throw new Error(`GitHub 모드에서 지원하지 않는 동작입니다: ${action}`)
  },

  async graph(id, { limit = 120, branch } = {}) {
    const repo = await resolve(id)
    const o = repo.owner
    const r = repo.repo
    let raw = []

    // 브랜치 목록은 커밋 조회와 라벨 표시 양쪽에 쓰이므로 한 번만 가져온다
    const list = await ghBranches(o, r)

    if (branch) {
      raw = await ghCommits(o, r, { sha: branch, per_page: String(Math.min(limit, 100)) })
    } else {
      // 전체 브랜치를 한 번에 주는 API 가 없어, 주요 브랜치를 모아 합친다.
      // gitflow 브랜치를 우선 담고, 자리가 남으면 나머지 브랜치로 채운다.
      // (전부 'other' 인 저장소에서 그래프가 비어 보이지 않도록)
      const isFlow = (b) => classify(b.name, repo.flow).type !== 'other'
      const picked = [...list.filter(isFlow), ...list.filter((b) => !isFlow(b))].slice(0, 8)
      const per = Math.max(20, Math.floor(limit / Math.max(1, picked.length)))
      const chunks = await Promise.all(
        picked.map((b) => ghCommits(o, r, { sha: b.name, per_page: String(Math.min(per, 100)) }).catch(() => [])),
      )
      const seen = new Set()
      for (const c of chunks.flat()) {
        if (seen.has(c.sha)) continue
        seen.add(c.sha)
        raw.push(c)
      }
      raw.sort((a, b) => new Date(b.commit.committer.date) - new Date(a.commit.committer.date))
      raw = raw.slice(0, limit)
    }

    // 브랜치 팁·태그를 라벨로 붙인다
    const tagList = await ghTags(o, r).catch(() => [])
    const labels = new Map()
    const addLabel = (sha, text) => {
      if (!labels.has(sha)) labels.set(sha, [])
      labels.get(sha).push(text)
    }
    for (const b of list) addLabel(b.commit.sha, b.name)
    for (const t of tagList) addLabel(t.commit.sha, `tag: ${t.name}`)

    const commits = raw.map((c) => ({
      sha: c.sha,
      short: c.sha.slice(0, 7),
      parents: c.parents.map((p) => p.sha),
      author: c.commit.author?.name,
      date: c.commit.committer?.date,
      subject: (c.commit.message || '').split('\n')[0],
      refs: labels.get(c.sha) || [],
      isMerge: c.parents.length > 1,
    }))

    // GitHub 은 한 번에 100개까지만 준다. 요청한 개수보다 적게 왔어도
    // 상한에 걸린 것이면 잘렸다고 알려야 한다.
    const perPageCapped = branch && limit > 100 && commits.length >= 100
    return { ...layoutLanes(commits), truncated: perPageCapped || commits.length >= limit }
  },

  async rules(id) {
    const repo = await resolve(id)
    const rules = repo.rules
    const flow = repo.flow
    const list = await branchesWithCommits(repo)
    const out = []
    const now = Date.now()
    const nameRe = safeRe(rules.branchName)
    const msgRe = safeRe(rules.commitMessage)
    const protectedSet = new Set(rules.protectedBranches || [])

    await Promise.all(
      list.map(async (b) => {
        const isProtected = protectedSet.has(b.name) || b.protected
        if (!isProtected && nameRe && !nameRe.test(b.name)) {
          out.push(withReason({ severity: 'error', rule: 'branch-name', branch: b.name, message: '브랜치 이름이 컨벤션에 맞지 않습니다', hint: `패턴: ${rules.branchName}` }))
        }
        if (!isProtected && rules.staleDays > 0 && b.date) {
          const age = Math.floor((now - new Date(b.date).getTime()) / DAY)
          if (age > rules.staleDays) {
            out.push(withReason({ severity: 'warn', rule: 'stale-branch', branch: b.name, message: `${age}일 동안 커밋이 없습니다`, hint: `기준: ${rules.staleDays}일` }))
          }
        }
        if (b.protected) {
          out.push(withReason({ severity: 'info', rule: 'protected', branch: b.name, message: 'GitHub 브랜치 보호가 설정되어 있습니다', hint: '' }))
        }
        // 커밋 메시지 컨벤션은 gitflow 브랜치에만 적용한다.
        // 모든 브랜치에 compare 를 날리면 요청 수가 브랜치 수만큼 늘고,
        // dependabot/* 같은 자동 생성 브랜치가 경고를 도배한다.
        const isFlowBranch = ['feature', 'release', 'hotfix', 'support'].includes(classify(b.name, flow).type)
        if (msgRe && !isProtected && isFlowBranch) {
          try {
            const cmp = await compare(repo.owner, repo.repo, flow.develop, b.name)
            for (const c of (cmp.commits || []).slice(-(rules.maxCommitsChecked || 30))) {
              if (c.parents.length > 1) continue
              const subject = (c.commit.message || '').split('\n')[0]
              if (!msgRe.test(subject)) {
                out.push(
                  withReason({
                    severity: 'warn',
                    rule: 'commit-message',
                    branch: b.name,
                    message: `${c.sha.slice(0, 7)} "${truncate(subject)}" (${c.commit.author?.name})`,
                    hint: `패턴: ${rules.commitMessage}`,
                  }),
                )
              }
            }
          } catch {
            /* develop 이 없거나 비교 불가 */
          }
        }
      }),
    )

    const summary = { error: 0, warn: 0, info: 0 }
    for (const v of out) summary[v.severity] += 1
    return { violations: out, summary, checkedBranches: list.length }
  },

  async github(id, state = 'open') {
    const repo = await resolve(id)
    const [meta, prs] = await Promise.all([meta_(repo.owner, repo.repo), pulls(repo.owner, repo.repo, state === 'merged' ? 'closed' : state)])
    const mapped = prs
      .filter((p) => (state === 'merged' ? p.merged_at : true))
      .map((p) => ({
        number: p.number,
        title: p.title,
        state: p.merged_at ? 'MERGED' : p.state.toUpperCase(),
        isDraft: p.draft,
        headRefName: p.head.ref,
        baseRefName: p.base.ref,
        author: { login: p.user?.login },
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        url: p.html_url,
        reviewDecision: null,
        labels: (p.labels || []).map((l) => ({ name: l.name })),
        additions: p.additions ?? 0,
        deletions: p.deletions ?? 0,
      }))
    return { auth: { available: true }, linked: true, nameWithOwner: meta.full_name, url: meta.html_url, ok: true, prs: mapped }
  },

  async createPR(id, { head, base, title, body, draft }) {
    const repo = await resolve(id)
    const pr = await createPull(repo.owner, repo.repo, { head, base, title, body, draft })
    return { url: pr.html_url }
  },

  async releaseNotes(id, { base, head }) {
    const repo = await resolve(id)
    const data = await generateNotes(repo.owner, repo.repo, { tag_name: head, previous_tag_name: base || undefined })
    return { ok: true, name: data.name, body: data.body }
  },
}

function safeRe(src) {
  if (!src) return null
  try {
    return new RegExp(src)
  } catch {
    return null
  }
}
