import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '../..')
const CONFIG_PATH = path.join(ROOT, 'gitflow.config.json')

export const DEFAULT_FLOW = {
  main: 'main',
  develop: 'develop',
  prefixes: {
    feature: 'feature/',
    release: 'release/',
    hotfix: 'hotfix/',
    support: 'support/',
  },
  tagPrefix: 'v',
}

export const DEFAULT_RULES = {
  branchName: '^(feature|release|hotfix|support)/[a-z0-9][a-z0-9._-]*$',
  commitMessage: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\([^)]+\\))?!?: .{1,}',
  protectedBranches: ['main', 'master', 'develop'],
  staleDays: 30,
  maxCommitsChecked: 30,
}

const DEFAULT_CONFIG = {
  repos: [],
  defaults: { flow: DEFAULT_FLOW, rules: DEFAULT_RULES },
}

let cache = null

export async function loadConfig({ fresh = false } = {}) {
  if (cache && !fresh) return cache
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    cache = {
      ...DEFAULT_CONFIG,
      ...parsed,
      defaults: {
        flow: { ...DEFAULT_FLOW, ...(parsed.defaults?.flow || {}) },
        rules: { ...DEFAULT_RULES, ...(parsed.defaults?.rules || {}) },
      },
      repos: parsed.repos || [],
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    cache = structuredClone(DEFAULT_CONFIG)
  }
  return cache
}

export async function saveConfig(next) {
  cache = next
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return cache
}

/** 저장소별 설정에 기본값을 합친 형태로 돌려준다. */
export async function getRepo(id) {
  const cfg = await loadConfig()
  const repo = cfg.repos.find((r) => r.id === id)
  if (!repo) return null
  return {
    ...repo,
    flow: { ...cfg.defaults.flow, ...(repo.flow || {}), prefixes: { ...cfg.defaults.flow.prefixes, ...(repo.flow?.prefixes || {}) } },
    rules: { ...cfg.defaults.rules, ...(repo.rules || {}) },
  }
}

export async function listRepos() {
  const cfg = await loadConfig()
  return Promise.all(cfg.repos.map((r) => getRepo(r.id)))
}

export function makeId(dir) {
  return path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣._-]+/g, '-')
    .replace(/^-|-$/g, '') || 'repo'
}
