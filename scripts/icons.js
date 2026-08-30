/**
 * public/favicon.svg 하나에서 모든 아이콘을 뽑는다.
 *
 * 아이콘이 여러 벌 흩어져 있으면 색이나 모양을 바꿀 때 일부만 갱신되고,
 * 홈 화면에는 옛 아이콘이 남는다. 원본은 SVG 하나뿐이고 나머지는 산출물이다.
 *
 *   npm run icons
 *
 * 산출물이 원본과 어긋나면 테스트(scripts/icons.test.js)가 잡는다.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PUBLIC_DIR = path.join(ROOT, 'public')
export const SOURCE = path.join(PUBLIC_DIR, 'favicon.svg')
export const LOCK = path.join(PUBLIC_DIR, 'icons.lock.json')

/** 아이콘 뒤에 까는 색. 원본 배경과 같아야 iOS 에서 테두리가 비지 않는다. */
const BACKDROP = '#0e1116'

/**
 * maskable 아이콘은 기기가 원·사각형 등으로 잘라낸다. 가장자리 20% 는
 * 잘려나갈 수 있으므로 그림을 안쪽으로 밀어 넣는다(안전 영역).
 */
const MASKABLE_SAFE_RATIO = 0.72

export const OUTPUTS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  // iOS 는 투명 배경을 검게 칠하고 모서리를 직접 둥글린다. 불투명 정사각형으로 준다.
  { file: 'apple-touch-icon.png', size: 180, opaque: true },
  { file: 'favicon-32.png', size: 32 },
]

/** .ico 안에 넣을 크기들 (윈도우·구형 브라우저 대응) */
const ICO_SIZES = [16, 32, 48]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function renderPng(svg, { size, maskable, opaque }) {
  if (maskable) {
    // 그림을 safe ratio 만큼 줄여 그린 뒤, 배경색 위 가운데에 얹는다.
    const inner = Math.round(size * MASKABLE_SAFE_RATIO)
    const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
    return sharp({
      create: { width: size, height: size, channels: 4, background: BACKDROP },
    })
      .composite([{ input: art, gravity: 'centre' }])
      .png()
      .toBuffer()
  }

  const img = sharp(svg, { density: 384 }).resize(size, size)
  // 불투명이 필요한 곳은 배경색으로 평탄화한다.
  return (opaque ? img.flatten({ background: BACKDROP }) : img).png({ compressionLevel: 9 }).toBuffer()
}

/**
 * PNG 들을 하나의 .ico 로 묶는다.
 * ICO 는 6바이트 헤더 + 항목당 16바이트 디렉터리 + 이미지 데이터이고,
 * 항목에 PNG 를 그대로 넣는 것이 허용된다(Vista 이후).
 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = 아이콘
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const dir = []
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // 너비 (256 은 0 으로 표기)
    e.writeUInt8(size >= 256 ? 0 : size, 1) // 높이
    e.writeUInt8(0, 2) // 팔레트 없음
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // 색상 평면
    e.writeUInt16LE(32, 6) // 비트 수
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    dir.push(e)
    offset += data.length
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.data)])
}

/** 원본 SVG 로 모든 아이콘을 만들고, 어떤 원본에서 나왔는지 기록한다. */
export async function generateIcons({ write = true } = {}) {
  const svg = await fs.readFile(SOURCE)
  const files = {}

  for (const spec of OUTPUTS) {
    files[spec.file] = await renderPng(svg, spec)
  }

  const icoParts = []
  for (const size of ICO_SIZES) {
    icoParts.push({ size, data: await renderPng(svg, { size }) })
  }
  files['favicon.ico'] = buildIco(icoParts)

  const lock = {
    source: 'favicon.svg',
    sourceHash: sha256(svg),
    outputs: Object.fromEntries(Object.keys(files).sort().map((f) => [f, sha256(files[f])])),
  }

  if (write) {
    for (const [name, data] of Object.entries(files)) {
      await fs.writeFile(path.join(PUBLIC_DIR, name), data)
    }
    await fs.writeFile(LOCK, JSON.stringify(lock, null, 2) + '\n')
  }
  return { files, lock }
}

// 직접 실행했을 때만 파일을 쓴다 (테스트는 함수만 가져다 쓴다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { lock } = await generateIcons()
  console.log(`favicon.svg → ${Object.keys(lock.outputs).length}개 생성`)
  for (const name of Object.keys(lock.outputs)) console.log(`  ${name}`)
}
