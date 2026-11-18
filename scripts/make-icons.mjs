// Genera public/icon-192.png y public/icon-512.png (carátula naranja sobre azul) sin dependencias.
// Uso: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [15, 23, 36], RING = [232, 93, 32], DIM = [52, 66, 90], NEEDLE = [240, 244, 250]

function pixel(x, y, s) {
  const c = s / 2, dx = x - c, dy = c - y, r = Math.hypot(dx, dy) / (s / 2)
  const ang = Math.atan2(dy, dx) // radianes, 0 = derecha, π/2 = arriba
  // Aro de 240° (de -30° a 210°); el tramo naranja termina donde apunta la aguja (60°).
  const onArc = ang > -Math.PI / 6 || ang < -5 * Math.PI / 6
  if (r > 0.52 && r < 0.66 && onArc) return ang > Math.PI / 3 || ang < -5 * Math.PI / 6 ? RING : DIM
  // Aguja hacia 60°.
  const nx = Math.cos(Math.PI / 3), ny = Math.sin(Math.PI / 3)
  const along = (dx * nx + dy * ny) / (s / 2), across = Math.abs(dx * ny - dy * nx) / (s / 2)
  if (along > -0.05 && along < 0.48 && across < 0.035) return NEEDLE
  if (r < 0.09) return NEEDLE
  return BG
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(s) {
  const raw = Buffer.alloc(s * (s * 3 + 1))
  for (let y = 0; y < s; y++) {
    raw[y * (s * 3 + 1)] = 0
    for (let x = 0; x < s; x++) raw.set(pixel(x + 0.5, y + 0.5, s), y * (s * 3 + 1) + 1 + x * 3)
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s))
console.log('Íconos generados en public/')
