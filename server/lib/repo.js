import fs from 'node:fs/promises'
import { git } from './exec.js'

// for-each-ref 는 %1f 로 0x1F(unit separator) 바이트를 출력한다.
const FS = '%1f'
const SEP = '\x1f'

/** 디렉터리가 git 워크트리인지 확인하고 최상위 경로를 돌려준다. */
export async function resolveWorktree(dir) {
  const r = await git(dir, ['rev-parse', '--show-toplevel'])
  return r.ok ? r.stdout : null
}

export async function currentBranch(cwd) {
  const r = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return r.ok ? r.stdout : null
}

export async function isDirty(cwd) {
  const r = await git(cwd, ['status', '--porcelain'])
  return { dirty: !!r.stdout, files: r.stdout ? r.stdout.split('\n') : [] }
}

/** 병합/리베이스가 중단된 상태인지, 충돌 파일은 무엇인지 알려준다. */
export async function mergeState(cwd) {
  const [mergeHead, rebase, conflicts] = await Promise.all([
    git(cwd, ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']),
    git(cwd, ['rev-parse', '--git-path', 'rebase-merge']),
    git(cwd, ['diff', '--name-only', '--diff-filter=U']),
  ])
  const merging = mergeHead.ok && !!mergeHead.stdout
  const files = conflicts.stdout ? conflicts.stdout.split('\n') : []
  return { merging, conflicts: files, inProgress: merging || files.length > 0, rebasePath: rebase.stdout }
}

export async function hasBranch(cwd, name) {
  const r = await git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`])
  return r.ok
}

export async function hasRemote(cwd, remote = 'origin') {
  const r = await git(cwd, ['remote'])
  return r.ok && r.stdout.split('\n').includes(remote)
}

/** 로컬 브랜치 전체를 메타데이터와 함께 반환한다. */
export async function listBranches(cwd) {
  const fmt = [
    '%(refname:short)',
    '%(objectname:short)',
    '%(committerdate:iso8601)',
    '%(authorname)',
    '%(contents:subject)',
    '%(upstream:short)',
    '%(upstream:track)',
    '%(HEAD)',
  ].join(FS)
  const r = await git(cwd, ['for-each-ref', '--sort=-committerdate', `--format=${fmt}`, 'refs/heads'])
  if (!r.ok || !r.stdout) return []
  return r.stdout.split('\n').map((line) => {
    const [name, sha, date, author, subject, upstream, track, head] = line.split(SEP)
    const ahead = /ahead (\d+)/.exec(track || '')
    const behind = /behind (\d+)/.exec(track || '')
    return {
      name,
      sha,
      date,
      author,
      subject,
      upstream: upstream || null,
      ahead: ahead ? Number(ahead[1]) : 0,
      behind: behind ? Number(behind[1]) : 0,
      gone: /gone/.test(track || ''),
      current: head === '*',
    }
  })
}

export async function listTags(cwd, limit = 20) {
  const r = await git(cwd, [
    'for-each-ref',
    '--sort=-creatordate',
    '--count',
    String(limit),
    `--format=%(refname:short)${FS}%(creatordate:iso8601)`,
    'refs/tags',
  ])
  if (!r.ok || !r.stdout) return []
  return r.stdout.split('\n').map((l) => {
    const [name, date] = l.split(SEP)
    return { name, date }
  })
}

/** base 대비 head 에만 있는 커밋 수 (계산 불가 시 null) */
export async function countAhead(cwd, base, head) {
  const r = await git(cwd, ['rev-list', '--count', `${base}..${head}`])
  return r.ok ? Number(r.stdout) : null
}

export function classify(branch, flow) {
  for (const [type, prefix] of Object.entries(flow.prefixes)) {
    if (prefix && branch.startsWith(prefix)) return { type, name: branch.slice(prefix.length) }
  }
  if (branch === flow.main) return { type: 'main', name: branch }
  if (branch === flow.develop) return { type: 'develop', name: branch }
  return { type: 'other', name: branch }
}

/** 조회에 실패했을 때도 화면이 기대하는 필드를 모두 채운 기본 요약 */
function emptySummary(repo) {
  return {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    flow: repo.flow,
    ok: true,
    branch: null,
    dirty: false,
    dirtyCount: 0,
    ahead: 0,
    behind: 0,
    branchCount: 0,
    counts: { feature: 0, release: 0, hotfix: 0, support: 0, other: 0 },
    hasRemote: false,
    developExists: false,
    mainExists: false,
    lastCommit: null,
  }
}

/** 대시보드 카드용 요약 */
export async function summarize(repo) {
  const cwd = repo.path
  const top = await resolveWorktree(cwd)
  if (!top) {
    // 실패해도 성공과 같은 키를 채워 돌려준다. 모양이 달라지면 화면이
    // summary.counts 같은 필드를 읽다가 통째로 터진다.
    return {
      ...emptySummary(repo),
      ok: false,
      error: (await fs.access(cwd).then(() => true, () => false))
        ? 'git 저장소가 아닙니다'
        : '경로를 찾을 수 없습니다',
    }
  }

  const [branch, dirty, branches, remoteOk] = await Promise.all([
    currentBranch(cwd),
    isDirty(cwd),
    listBranches(cwd),
    hasRemote(cwd),
  ])

  const counts = { feature: 0, release: 0, hotfix: 0, support: 0, other: 0 }
  for (const b of branches) {
    const c = classify(b.name, repo.flow)
    if (c.type in counts) counts[c.type] += 1
  }

  const cur = branches.find((b) => b.current)

  return {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    flow: repo.flow,
    ok: true,
    branch,
    dirty: dirty.dirty,
    dirtyCount: dirty.files.length,
    ahead: cur?.ahead ?? 0,
    behind: cur?.behind ?? 0,
    branchCount: branches.length,
    counts,
    hasRemote: remoteOk,
    developExists: branches.some((b) => b.name === repo.flow.develop),
    mainExists: branches.some((b) => b.name === repo.flow.main),
    lastCommit: cur ? { sha: cur.sha, subject: cur.subject, date: cur.date, author: cur.author } : null,
  }
}
