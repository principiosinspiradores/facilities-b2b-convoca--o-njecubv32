const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const publicDir = path.resolve(__dirname, 'public')

const CRC32_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC32_TABLE[i] = c >>> 0
}

function calcCrc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

function makeChunk(type, data) {
  const len = data.length
  const chunk = Buffer.alloc(4 + 4 + len + 4)
  chunk.writeUInt32BE(len, 0)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)
  const crcVal = calcCrc32(chunk.subarray(4, 8 + len))
  chunk.writeUInt32BE(crcVal, 8 + len)
  return chunk
}

function generatePwaPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const ihdrChunk = makeChunk('IHDR', ihdr)

  const raw = Buffer.alloc(size * (1 + size * 3))
  const center = size / 2
  const clockRadius = size * 0.36
  const innerRadius = size * 0.28
  const centerDotRadius = size * 0.04
  const badgeRadius = size * 0.44

  let ptr = 0
  for (let y = 0; y < size; y++) {
    raw[ptr++] = 0 // Filter 0 (None)
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)

      let r = 15
      let g = 118
      let b = 110

      if (dist < badgeRadius) {
        r = 13
        g = 148
        b = 136
      }

      if (dist <= clockRadius && dist >= innerRadius) {
        r = 255
        g = 255
        b = 255
      } else if (dist < innerRadius) {
        r = 15
        g = 118
        b = 110

        if (dist <= centerDotRadius) {
          r = 255
          g = 255
          b = 255
        }

        const handW = size * 0.03
        if (Math.abs(dx) <= handW && dy <= 0 && dy >= -innerRadius * 0.62) {
          r = 255
          g = 255
          b = 255
        }

        if (Math.abs(dy) <= handW && dx >= 0 && dx <= innerRadius * 0.58) {
          r = 255
          g = 255
          b = 255
        }
      }

      raw[ptr++] = r
      raw[ptr++] = g
      raw[ptr++] = b
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })
  const idatChunk = makeChunk('IDAT', compressed)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

const pwa192 = generatePwaPng(192)
const pwa512 = generatePwaPng(512)

fs.writeFileSync(path.join(publicDir, 'pwa-192.png'), pwa192)
fs.writeFileSync(path.join(publicDir, 'pwa-512.png'), pwa512)

console.log('[PWA ICONS] pwa-192.png e pwa-512.png gerados em public/ com sucesso!')
