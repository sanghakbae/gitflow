import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RULES, RULE_IDS, makeViolation, ruleLabel } from './ruleCatalog.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 소스에서 실제로 쓰인 규칙 id 를 긁어낸다.
 * 두 백엔드가 서로 다른 형태로 위반을 만든다:
 *   violation('warn', 'commit-message', ...)   ← 위치 인자 (로컬)
 *   { severity: 'warn', rule: 'commit-message' } ← 객체 (GitHub)
 */
function rulesUsedIn(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
  return [
    ...[...src.matchAll(/rule: '([a-z-]+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/violation\(\s*'[a-z]+',\s*'([a-z-]+)'/g)].map((m) => m[1]),
  ]
}

describe('규칙 카탈로그', () => {
  it('모든 규칙에 라벨과 근거가 있다', () => {
    for (const id of RULE_IDS) {
      expect(RULES[id].label, `${id} 라벨`).toBeTruthy()
      expect(RULES[id].reason.length, `${id} 근거`).toBeGreaterThan(30)
    }
  })

  // 라벨을 등록하지 않아 화면에 영문 id 가 그대로 노출된 적이 있다.
  // 백엔드가 쓰는 id 는 반드시 카탈로그에 있어야 한다.
  it.each([['server/lib/rules.js'], ['src/backends/github.js']])('%s 가 쓰는 규칙은 모두 등록돼 있다', (file) => {
    const used = rulesUsedIn(file)
    expect(used.length).toBeGreaterThan(0)
    for (const id of used) expect(RULE_IDS, `${file} 의 '${id}'`).toContain(id)
  })

  it('등록되지 않은 규칙으로 위반을 만들면 즉시 실패한다', () => {
    expect(() => makeViolation({ severity: 'warn', rule: 'nope', branch: 'x', message: 'm' })).toThrow(/알 수 없는 규칙/)
  })

  it('위반 객체에 근거가 함께 담긴다', () => {
    const v = makeViolation({ severity: 'error', rule: 'branch-name', branch: 'foo', message: 'm' })
    expect(v.why).toBe(RULES['branch-name'].reason)
  })

  it('모르는 id 를 표시할 때도 화면이 깨지지 않는다', () => {
    expect(ruleLabel('unknown-rule')).toBe('unknown-rule')
  })
})
