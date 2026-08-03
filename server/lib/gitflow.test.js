import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { run } from './exec.js'
import { plan, planInit, validateName } from './gitflow.js'

const FLOW = {
  main: 'main',
  develop: 'develop',
  prefixes: { feature: 'feature/', release: 'release/', hotfix: 'hotfix/', support: 'support/' },
  tagPrefix: 'v',
}

let dir
const repo = () => ({ path: dir, flow: FLOW })
const git = (...args) => run('git', args, { cwd: dir })
/** 실행 계획을 "git checkout develop" 같은 문자열 배열로 */
const lines = (p) => p.steps.map((s) => s.join(' '))

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitflow-test-'))
  await git('init', '-q', '-b', 'main')
  await git('config', 'user.email', 't@e.com')
  await git('config', 'user.name', 'T')
  await fs.writeFile(path.join(dir, 'f.txt'), 'a\n')
  await git('add', '.')
  await git('commit', '-qm', 'chore: init')
  await git('branch', 'develop')
  await git('branch', 'feature/existing')
})

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('validateName', () => {
  it.each(['login', 'login-oauth', '1.4.0', 'a/b'])('허용: %s', (n) => {
    expect(validateName(n)).toBe(n)
  })

  it.each(['', ' ', '-lead', 'has space', 'semi;colon', '$(whoami)'])('거부: %s', (n) => {
    expect(() => validateName(n)).toThrow()
  })
})

describe('plan — feature', () => {
  it('start 는 develop 에서 분기한다', async () => {
    const p = await plan(repo(), { action: 'start', type: 'feature', name: 'login' })
    expect(lines(p)).toEqual(['git checkout develop', 'git checkout -b feature/login develop'])
  })

  it('start 는 이미 있는 브랜치를 거부한다', async () => {
    await expect(plan(repo(), { action: 'start', type: 'feature', name: 'existing' })).rejects.toThrow(/이미 존재/)
  })

  it('finish 는 develop 로 --no-ff 병합 후 브랜치를 지운다', async () => {
    const p = await plan(repo(), { action: 'finish', type: 'feature', name: 'existing' })
    expect(lines(p)).toEqual([
      'git checkout develop',
      "git merge --no-ff -m Merge branch 'feature/existing' into develop feature/existing",
      'git branch -d feature/existing',
    ])
  })

  it('feature 에는 태그를 만들지 않는다', async () => {
    const p = await plan(repo(), { action: 'finish', type: 'feature', name: 'existing' })
    expect(p.tag).toBeNull()
    expect(lines(p).some((l) => l.includes('tag'))).toBe(false)
  })
})

describe('plan — release / hotfix', () => {
  it('release finish 는 main 병합 → 태그 → develop 역병합 순서다', async () => {
    await git('branch', 'release/1.0.0', 'develop')
    const p = await plan(repo(), { action: 'finish', type: 'release', name: '1.0.0', version: '1.0.0' })
    const l = lines(p)

    expect(p.tag).toBe('v1.0.0')
    // 순서가 핵심이다: main 을 먼저 굳히고 태그를 붙인 뒤 develop 으로 되돌린다
    const mainMerge = l.findIndex((x) => x.includes("into main"))
    const tagStep = l.findIndex((x) => x.startsWith('git tag'))
    const devMerge = l.findIndex((x) => x.includes('into develop'))
    expect(mainMerge).toBeLessThan(tagStep)
    expect(tagStep).toBeLessThan(devMerge)
  })

  it('hotfix start 는 develop 이 아니라 main 에서 분기한다', async () => {
    const p = await plan(repo(), { action: 'start', type: 'hotfix', name: '1.0.1' })
    expect(lines(p)).toEqual(['git checkout main', 'git checkout -b hotfix/1.0.1 main'])
    expect(p.base).toBe('main')
  })

  it('원격 옵션을 켜면 pull/push 단계가 끼어든다', async () => {
    await git('remote', 'add', 'origin', 'https://example.invalid/x.git')
    const p = await plan(repo(), { action: 'finish', type: 'feature', name: 'existing', push: true })
    const l = lines(p)
    expect(l).toContain('git pull --ff-only origin develop')
    expect(l).toContain('git push origin develop')
    expect(l).toContain('git push origin --delete feature/existing')
    await git('remote', 'remove', 'origin')
  })
})

describe('plan — 안전장치', () => {
  it('작업 트리가 더러우면 시작하지 못한다', async () => {
    await fs.writeFile(path.join(dir, 'f.txt'), 'dirty\n')
    await expect(plan(repo(), { action: 'start', type: 'feature', name: 'x' })).rejects.toThrow(/커밋되지 않은 변경/)
    await git('checkout', '--', 'f.txt')
  })

  it('없는 브랜치는 finish 할 수 없다', async () => {
    await expect(plan(repo(), { action: 'finish', type: 'feature', name: 'ghost' })).rejects.toThrow(/브랜치가 없습니다/)
  })

  it('브랜치 이름은 셸에 넘어가지 않도록 인자 배열로 유지된다', async () => {
    const p = await plan(repo(), { action: 'start', type: 'feature', name: 'a/b' })
    // 각 step 은 [명령, ...인자] 배열이어야 한다 (문자열 연결 금지)
    for (const step of p.steps) expect(Array.isArray(step)).toBe(true)
    expect(p.steps.at(-1)).toEqual(['git', 'checkout', '-b', 'feature/a/b', 'develop'])
  })
})

describe('planInit', () => {
  it('develop 이 이미 있으면 거부한다', async () => {
    await expect(planInit(repo())).rejects.toThrow(/이미/)
  })

  it('develop 이 없으면 main 에서 만든다', async () => {
    await git('branch', '-D', 'develop')
    const p = await planInit(repo())
    expect(lines(p)).toEqual(['git checkout main', 'git checkout -b develop main'])
    await git('branch', 'develop', 'main')
  })
})
