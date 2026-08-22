import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { run } from './exec.js'
import { summarize } from './repo.js'

const FLOW = {
  main: 'main',
  develop: 'develop',
  prefixes: { feature: 'feature/', release: 'release/', hotfix: 'hotfix/', support: 'support/' },
  tagPrefix: 'v',
}

/**
 * 화면은 summary 의 필드를 그대로 읽는다. 실패했을 때 모양이 달라지면
 * summary.counts 같은 걸 읽다가 화면이 통째로 터진다 (실제로 겪음).
 */
describe('summarize 응답 모양', () => {
  it('성공과 실패가 같은 키를 갖는다', async () => {
    const good = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-ok-'))
    await run('git', ['init', '-q', '-b', 'main'], { cwd: good })
    await run('git', ['config', 'user.email', 't@e.com'], { cwd: good })
    await run('git', ['config', 'user.name', 'T'], { cwd: good })
    await fs.writeFile(path.join(good, 'a.txt'), 'x')
    await run('git', ['add', '.'], { cwd: good })
    await run('git', ['commit', '-qm', 'chore: init'], { cwd: good })

    const ok = await summarize({ id: 'g', name: 'g', path: good, flow: FLOW })
    const gone = await summarize({ id: 'b', name: 'b', path: '/nope/does/not/exist', flow: FLOW })

    expect(ok.ok).toBe(true)
    expect(gone.ok).toBe(false)
    // error 키만 추가로 붙고, 나머지 키 집합은 같아야 한다
    expect(Object.keys(gone).filter((k) => k !== 'error').sort()).toEqual(Object.keys(ok).sort())

    await fs.rm(good, { recursive: true, force: true })
  })

  it('경로가 없으면 그 사실을 알려준다', async () => {
    const s = await summarize({ id: 'b', name: 'b', path: '/nope/does/not/exist', flow: FLOW })
    expect(s.error).toMatch(/경로를 찾을 수 없습니다/)
    // 화면이 읽는 필드들이 비어 있어도 존재는 해야 한다
    expect(s.counts.feature).toBe(0)
    expect(s.developExists).toBe(false)
    expect(s.branchCount).toBe(0)
  })

  it('git 저장소가 아닌 폴더는 그렇게 구분한다', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'plain-'))
    const s = await summarize({ id: 'p', name: 'p', path: plain, flow: FLOW })
    expect(s.ok).toBe(false)
    expect(s.error).toMatch(/git 저장소가 아닙니다/)
    await fs.rm(plain, { recursive: true, force: true })
  })
})
