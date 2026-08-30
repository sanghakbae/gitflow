import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// iOS 는 글자가 16px 보다 작은 input/select/textarea 에 포커스가 가면
// 화면을 통째로 확대한다. 모달이 열리며 포커스가 가면 그 즉시 튄다.
//
// 이 규칙은 한 번 고쳐도 되살아난다 — 모바일 타이포를 정리하면서 입력칸까지
// 같이 줄이기 때문이다. 그래서 사람 기억이 아니라 여기서 막는다.

const CSS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles.css'),
  'utf8',
)

const MIN_PX = 16
const CONTROL = /(^|[\s,>+~])(input|select|textarea)(\s|,|:|\[|\{|$)/

/** 좁은 화면·터치 기기를 대상으로 하는 미디어쿼리 블록만 뽑는다. */
function mobileBlocks(css) {
  const out = []
  const re = /@media\s*([^{]*)\{/g
  let m
  while ((m = re.exec(css))) {
    const cond = m[1]
    const maxWidth = /max-width:\s*(\d+)px/.exec(cond)
    const coarse = /pointer:\s*coarse/.test(cond)
    // 데스크톱 전용 보정은 대상이 아니다
    if (!coarse && (!maxWidth || Number(maxWidth[1]) > 900)) continue

    let depth = 1
    let i = re.lastIndex
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') depth -= 1
      i += 1
    }
    out.push({ cond: cond.trim(), body: css.slice(re.lastIndex, i - 1) })
  }
  return out
}

const rules = (body) =>
  [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), decls: m[2] }))

describe('iOS 입력칸 확대 방지', () => {
  it('좁은 화면에서 입력칸 글자가 16px 아래로 내려가지 않는다', () => {
    const offenders = []
    for (const block of mobileBlocks(CSS)) {
      for (const { selector, decls } of rules(block.body)) {
        if (!CONTROL.test(selector)) continue
        const fs_ = /font-size:\s*([^;]+)/.exec(decls)
        if (!fs_) continue
        const px = /^(\d+(?:\.\d+)?)px/.exec(fs_[1].trim())
        if (!px) continue // 변수로 잡은 값은 아래 테스트에서 검사한다
        if (Number(px[1]) < MIN_PX) offenders.push(`@media(${block.cond}) ${selector} → ${fs_[1].trim()}`)
      }
    }
    expect(offenders, 'iOS 가 포커스 시 화면을 확대합니다. 입력칸은 16px 이상이어야 합니다').toEqual([])
  })

  it('입력칸 전용 변수(--m-font-input)가 16px 이상이다', () => {
    const m = /--m-font-input:\s*(\d+(?:\.\d+)?)px/.exec(CSS)
    expect(m, '--m-font-input 변수가 없습니다 — 입력칸 하한이 사라졌습니다').not.toBeNull()
    expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_PX)
  })

  it('좁은 화면에서 입력칸에 그 변수를 실제로 적용한다', () => {
    const applied = mobileBlocks(CSS).some((b) =>
      rules(b.body).some((r) => CONTROL.test(r.selector) && /var\(--m-font-input\)/.test(r.decls)),
    )
    expect(applied, '변수만 있고 입력칸에 적용되지 않았습니다').toBe(true)
  })

  // 정규식 패턴·경로·SHA 처럼 띄어쓰기 없는 긴 문자열이 좁은 화면에서 폭을
  // 밀어내 가로 스크롤을 만든다. 실제로 규칙 검사 탭이 그렇게 터졌다.
  it('좁은 화면에서 긴 문자열이 끊기도록 해 둔다', () => {
    const wrapped = mobileBlocks(CSS).some((b) =>
      rules(b.body).some(
        (r) => /(^|[\s,])(td|\.mono-sm|\.why)(\s|,|$)/.test(r.selector) && /overflow-wrap:\s*anywhere/.test(r.decls),
      ),
    )
    expect(wrapped, '긴 토큰이 줄바꿈되지 않으면 가로 스크롤이 생깁니다').toBe(true)
  })

  // 확대 자체를 막으면 확대해서 보는 사람을 막는다. 하한으로만 해결한다.
  it('viewport 에 user-scalable=no / maximum-scale 을 쓰지 않는다', () => {
    const html = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html'),
      'utf8',
    )
    const viewport = /<meta[^>]*name="viewport"[^>]*>/i.exec(html)?.[0] || ''
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i)
    expect(viewport).not.toMatch(/maximum-scale/i)
  })
})
