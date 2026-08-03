import { runSteps } from './exec.js'
import { hasBranch, hasRemote, isDirty } from './repo.js'

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

export function validateName(name) {
  if (!name || !NAME_RE.test(name)) {
    throw Object.assign(new Error(`잘못된 이름입니다: "${name}" (영문/숫자로 시작, 공백 불가)`), { status: 400 })
  }
  return name
}

const fail = (msg) => Object.assign(new Error(msg), { status: 400 })

function branchOf(flow, type, name) {
  return `${flow.prefixes[type]}${name}`
}

/**
 * git-flow 동작 하나를 실행 계획(명령 배열)으로 컴파일한다.
 * UI 는 dryRun 으로 먼저 계획을 받아 보여주고, 확인 후 실제 실행한다.
 */
export async function plan(repo, { action, type, name, version, push = false, deleteBranch = true, remote = 'origin' }) {
  const cwd = repo.path
  const flow = repo.flow
  const remoteOk = push && (await hasRemote(cwd, remote))
  if (push && !remoteOk) throw fail(`원격 "${remote}" 가 없어 push 할 수 없습니다`)

  const dirty = await isDirty(cwd)
  if (dirty.dirty) throw fail(`작업 트리에 커밋되지 않은 변경 ${dirty.files.length}건이 있습니다. 먼저 정리하세요.`)

  if (action === 'start') return planStart(repo, { type, name, push, remote })
  if (action === 'finish') return planFinish(repo, { type, name, version, push, deleteBranch, remote })
  if (action === 'publish') {
    const branch = branchOf(flow, type, name)
    if (!(await hasBranch(cwd, branch))) throw fail(`브랜치가 없습니다: ${branch}`)
    return { title: `${branch} 원격 게시`, branch, steps: [['git', 'push', '-u', remote, branch]] }
  }
  throw fail(`알 수 없는 동작: ${action}`)
}

async function planStart(repo, { type, name, push, remote }) {
  const { path: cwd, flow } = repo
  validateName(name)
  const branch = branchOf(flow, type, name)
  if (await hasBranch(cwd, branch)) throw fail(`이미 존재하는 브랜치입니다: ${branch}`)

  const base = type === 'hotfix' || type === 'support' ? flow.main : flow.develop
  if (!(await hasBranch(cwd, base))) throw fail(`기준 브랜치가 없습니다: ${base}`)

  const steps = [
    ['git', 'checkout', base],
    push ? ['git', 'pull', '--ff-only', remote, base] : null,
    ['git', 'checkout', '-b', branch, base],
    push ? ['git', 'push', '-u', remote, branch] : null,
  ]
  return { title: `${type} 시작 → ${branch}`, branch, base, steps: steps.filter(Boolean) }
}

async function planFinish(repo, { type, name, version, push, deleteBranch, remote }) {
  const { path: cwd, flow } = repo
  validateName(name)
  const branch = branchOf(flow, type, name)
  if (!(await hasBranch(cwd, branch))) throw fail(`브랜치가 없습니다: ${branch}`)

  const tag = type === 'release' || type === 'hotfix' ? `${flow.tagPrefix}${version || name}` : null
  const steps = []

  if (type === 'feature') {
    if (!(await hasBranch(cwd, flow.develop))) throw fail(`브랜치가 없습니다: ${flow.develop}`)
    steps.push(['git', 'checkout', flow.develop])
    if (push) steps.push(['git', 'pull', '--ff-only', remote, flow.develop])
    steps.push(['git', 'merge', '--no-ff', '-m', `Merge branch '${branch}' into ${flow.develop}`, branch])
    if (deleteBranch) steps.push(['git', 'branch', '-d', branch])
    if (push) {
      steps.push(['git', 'push', remote, flow.develop])
      if (deleteBranch) steps.push(['git', 'push', remote, '--delete', branch])
    }
  } else if (type === 'release' || type === 'hotfix') {
    for (const b of [flow.main, flow.develop]) {
      if (!(await hasBranch(cwd, b))) throw fail(`브랜치가 없습니다: ${b}`)
    }
    // 1) main 으로 병합 후 태그
    steps.push(['git', 'checkout', flow.main])
    if (push) steps.push(['git', 'pull', '--ff-only', remote, flow.main])
    steps.push(['git', 'merge', '--no-ff', '-m', `Merge branch '${branch}' into ${flow.main}`, branch])
    steps.push(['git', 'tag', '-a', tag, '-m', `${type} ${tag}`])
    // 2) develop 으로 역병합 (릴리즈 중 수정사항 반영)
    steps.push(['git', 'checkout', flow.develop])
    if (push) steps.push(['git', 'pull', '--ff-only', remote, flow.develop])
    steps.push(['git', 'merge', '--no-ff', '-m', `Merge branch '${branch}' into ${flow.develop}`, branch])
    if (deleteBranch) steps.push(['git', 'branch', '-d', branch])
    if (push) {
      steps.push(['git', 'push', remote, flow.main])
      steps.push(['git', 'push', remote, flow.develop])
      steps.push(['git', 'push', remote, tag])
      if (deleteBranch) steps.push(['git', 'push', remote, '--delete', branch])
    }
  } else {
    throw fail(`${type} 은(는) finish 를 지원하지 않습니다`)
  }

  return { title: `${type} 완료 → ${branch}${tag ? ` (태그 ${tag})` : ''}`, branch, tag, steps }
}

export async function execute(repo, body) {
  const p = await plan(repo, body)
  const result = await runSteps(repo.path, p.steps, { dryRun: !!body.dryRun })
  return { ...p, ...result }
}

/** develop / main 이 없는 저장소를 git-flow 구조로 초기화한다. */
export async function planInit(repo, { push = false, remote = 'origin' } = {}) {
  const { path: cwd, flow } = repo
  if (!(await hasBranch(cwd, flow.main))) throw fail(`메인 브랜치(${flow.main})가 없습니다. 설정에서 이름을 확인하세요.`)
  if (await hasBranch(cwd, flow.develop)) throw fail(`이미 ${flow.develop} 브랜치가 있습니다`)
  const steps = [
    ['git', 'checkout', flow.main],
    ['git', 'checkout', '-b', flow.develop, flow.main],
    push ? ['git', 'push', '-u', remote, flow.develop] : null,
  ].filter(Boolean)
  return { title: `git-flow 초기화 (${flow.develop} 생성)`, steps }
}
