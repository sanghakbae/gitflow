import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCK, OUTPUTS, PUBLIC_DIR, SOURCE, generateIcons } from './icons.js'

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const html = fs.readFileSync(path.join(PUBLIC_DIR, '..', 'index.html'), 'utf8')
const manifest = readJson(path.join(PUBLIC_DIR, 'manifest.webmanifest'))

describe('아이콘 파이프라인', () => {
  // 원본을 고치고 재생성을 잊으면 홈 화면에 옛 아이콘이 남는다.
  // 지금 SVG 로 다시 뽑아 산출물과 바이트가 같은지 본다.
  it('산출물이 현재 favicon.svg 와 일치한다', async () => {
    const { lock } = await generateIcons({ write: false })
    const saved = readJson(LOCK)

    expect(lock.sourceHash, 'favicon.svg 가 바뀌었습니다 — npm run icons 를 실행하세요').toBe(saved.sourceHash)
    expect(lock.outputs, '아이콘이 원본과 어긋납니다 — npm run icons 를 실행하세요').toEqual(saved.outputs)
  })

  it('선언한 아이콘이 모두 존재하고 크기가 맞다', async () => {
    const sharp = (await import('sharp')).default
    for (const { file, size } of OUTPUTS) {
      const p = path.join(PUBLIC_DIR, file)
      expect(fs.existsSync(p), `${file} 없음`).toBe(true)
      const meta = await sharp(p).metadata()
      expect({ file, w: meta.width, h: meta.height }).toEqual({ file, w: size, h: size })
    }
    expect(fs.existsSync(path.join(PUBLIC_DIR, 'favicon.ico'))).toBe(true)
  })

  // iOS 는 투명 배경을 검게 칠하고 모서리를 스스로 둥글린다.
  it('apple-touch-icon 은 불투명하다', async () => {
    const sharp = (await import('sharp')).default
    const meta = await sharp(path.join(PUBLIC_DIR, 'apple-touch-icon.png')).metadata()
    expect(meta.hasAlpha).toBe(false)
  })

  it('매니페스트가 가리키는 아이콘이 실제로 있다', () => {
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, icon.src.replace(/^\//, ''))), icon.src).toBe(true)
    }
    // 안드로이드 홈 화면이 잘라내도 그림이 살아 있으려면 maskable 이 필요하다
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('index.html 이 가리키는 아이콘이 실제로 있다', () => {
    const hrefs = [...html.matchAll(/<link[^>]+href="(\/[^"]+\.(?:png|ico|svg|webmanifest))"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(fs.existsSync(path.join(PUBLIC_DIR, href.replace(/^\//, ''))), href).toBe(true)
    }
  })

  it('매니페스트가 설치 요건을 갖춘다', () => {
    expect(manifest.name).toBe('GitFlow Manager')
    expect(manifest.display).toBe('standalone') // 주소창 없이 열린다
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    // 192·512 는 안드로이드 설치 배너의 최소 조건이다
    for (const size of ['192x192', '512x512']) {
      expect(manifest.icons.some((i) => i.sizes === size), `${size} 아이콘 필요`).toBe(true)
    }
  })

  it('원본 SVG 가 저장소에 있다', () => {
    expect(fs.existsSync(SOURCE)).toBe(true)
  })
})
