import { describe, expect, it } from 'vitest'
import { githubBackend } from './github.js'
import { localBackend } from './local.js'

/**
 * 화면은 어느 백엔드인지 모른 채 같은 메서드를 부른다. 한쪽에만 메서드가
 * 생기면 다른 모드에서 런타임에 터지므로, 인터페이스가 어긋나면 여기서 잡는다.
 */
const REQUIRED = [
  'config',
  'saveConfig',
  'dashboard',
  'scan',
  'addRepo',
  'updateRepo',
  'removeRepo',
  'repo',
  'fetch',
  'checkout',
  'deleteBranch',
  'abortMerge',
  'flow',
  'flowInit',
  'graph',
  'rules',
  'github',
  'createPR',
  'releaseNotes',
]

const CAPS = ['checkout', 'scan', 'workingTree', 'publish', 'localPath']

describe('백엔드 인터페이스 일치', () => {
  it.each([
    ['local', localBackend],
    ['github', githubBackend],
  ])('%s 백엔드가 모든 메서드를 제공한다', (_name, backend) => {
    for (const m of REQUIRED) expect(typeof backend[m], m).toBe('function')
  })

  it('두 백엔드의 메서드 집합이 같다', () => {
    const fns = (b) =>
      Object.keys(b)
        .filter((k) => typeof b[k] === 'function')
        .sort()
    expect(fns(localBackend)).toEqual(fns(githubBackend))
  })

  it('두 백엔드가 같은 caps 키를 선언한다', () => {
    expect(Object.keys(localBackend.caps).sort()).toEqual(CAPS.slice().sort())
    expect(Object.keys(githubBackend.caps).sort()).toEqual(CAPS.slice().sort())
  })

  it('mode 로 서로 구분된다', () => {
    expect(localBackend.mode).toBe('local')
    expect(githubBackend.mode).toBe('github')
  })

  // GitHub 모드는 로컬 작업 트리가 없다. caps 가 거짓말을 하면 화면이
  // 불가능한 버튼을 보여준다.
  it('GitHub 모드는 로컬 전용 기능을 켜지 않는다', () => {
    for (const c of CAPS) expect(githubBackend.caps[c], c).toBe(false)
  })

  it('로컬 모드는 로컬 전용 기능을 모두 켠다', () => {
    for (const c of CAPS) expect(localBackend.caps[c], c).toBe(true)
  })
})
