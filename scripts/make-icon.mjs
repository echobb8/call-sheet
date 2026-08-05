// Generates build/icon.png (1024×1024) — dark house rounded square with an
// amber call-sheet page under a clapper stick. Pure Node: math-drawn pixels
// + hand-rolled PNG (same rig as the other suite apps).

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const SIZE = 1024
const px = new Uint8Array(SIZE * SIZE * 4)

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r)
  const qy = Math.abs(y - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

// Signed distance to a convex quad (clapper stick parallelogram).
function sdQuad(x, y, pts) {
  let d = -Infinity
  for (let k = 0; k < 4; k++) {
    const [x1, y1] = pts[k]
    const [x2, y2] = pts[(k + 1) % 4]
    const nx = y2 - y1
    const ny = x1 - x2
    const len = Math.hypot(nx, ny)
    d = Math.max(d, ((x - x1) * nx + (y - y1) * ny) / len)
  }
  return d
}

const AMBER = [0xf0, 0xb4, 0x29]
const AMBER_HI = [0xff, 0xd0, 0x5e]
const PAGE = { cx: 512, cy: 585, hw: 205, hh: 235, r: 30 }
// Clapper stick: hinged at the page's top-left, lifted to the right.
const STICK = [
  [297, 350],
  [712, 258],
  [736, 344],
  [321, 392]
]
const LINES = [
  { y: 520, x1: 392, x2: 632 },
  { y: 600, x1: 392, x2: 596 },
  { y: 680, x1: 392, x2: 632 }
]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4

    const dBg = sdRoundRect(x, y, 512, 512, 512, 512, 224)
    const bgAlpha = clamp(0.5 - dBg, 0, 1)
    if (bgAlpha <= 0) {
      px[i + 3] = 0
      continue
    }
    const t = y / SIZE
    let rC = lerp(0x16, 0x0a, t)
    let gC = lerp(0x18, 0x0b, t)
    let bC = lerp(0x1d, 0x0e, t)

    // Amber radial glow behind the sheet.
    const gd = Math.hypot(x - 512, y - 500)
    const glow = Math.pow(clamp(1 - gd / 580, 0, 1), 2) * 0.26
    rC += (AMBER[0] - rC) * glow
    gC += (AMBER[1] - gC) * glow
    bC += (AMBER[2] - bC) * glow * 0.55

    // Page: soft fill + crisp amber outline.
    const dPage = sdRoundRect(x, y, PAGE.cx, PAGE.cy, PAGE.hw, PAGE.hh, PAGE.r)
    if (dPage < 0) {
      const fill = 0.16
      rC += (0x2a - rC) * fill + AMBER[0] * 0.03
      gC += (0x2b - gC) * fill + AMBER[1] * 0.03
      bC += (0x30 - bC) * fill + AMBER[2] * 0.015
    }
    const edgePage = clamp(1 - Math.abs(dPage) / 11, 0, 1)
    if (edgePage > 0) {
      const e = Math.pow(edgePage, 1.4)
      rC = lerp(rC, AMBER[0], e)
      gC = lerp(gC, AMBER[1], e)
      bC = lerp(bC, AMBER[2], e)
    }

    // Clapper stick: filled amber with a highlight gradient along its length.
    const dStick = sdQuad(x, y, STICK)
    if (dStick < 14) {
      const a = clamp(0.5 - dStick, 0, 1)
      const along = clamp((x - 297) / (736 - 297), 0, 1)
      const col = [
        lerp(AMBER[0], AMBER_HI[0], along),
        lerp(AMBER[1], AMBER_HI[1], along),
        lerp(AMBER[2], AMBER_HI[2], along)
      ]
      rC = lerp(rC, col[0], a)
      gC = lerp(gC, col[1], a)
      bC = lerp(bC, col[2], a)
    }

    // Sheet lines: rounded amber strokes.
    for (const ln of LINES) {
      const lx = clamp(x, ln.x1, ln.x2)
      const dLine = Math.hypot(x - lx, y - ln.y) - 13
      const a = clamp(0.5 - dLine, 0, 1) * 0.92
      if (a > 0) {
        rC = lerp(rC, AMBER[0], a)
        gC = lerp(gC, AMBER[1], a)
        bC = lerp(bC, AMBER[2], a)
      }
    }

    px[i] = clamp(Math.round(rC), 0, 255)
    px[i + 1] = clamp(Math.round(gC), 0, 255)
    px[i + 2] = clamp(Math.round(bC), 0, 255)
    px[i + 3] = Math.round(bgAlpha * 255)
  }
}

// ---- hand-rolled PNG ----
const crcTable = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([len, body, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  px.subarray(y * SIZE * 4, (y + 1) * SIZE * 4).forEach((v, k) => {
    raw[y * (SIZE * 4 + 1) + 1 + k] = v
  })
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../build/icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`)
