const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const projectRoot = path.resolve(__dirname, '..')
const sourcePath = path.resolve(
  projectRoot,
  'src/assets/logo-housekeeping-novo-favicon-quadrado-6fb6f.png',
)
const publicDir = path.resolve(projectRoot, 'public')

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

function decodePng(buf) {
  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idatBuffers = []

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii')
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatBuffers.push(data)
    }
    pos += 12 + len
  }

  const raw = zlib.inflateSync(Buffer.concat(idatBuffers))
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const stride = 1 + width * bpp
  const pixels = Buffer.alloc(width * height * 4) // RGBA

  let prevScanline = Buffer.alloc(width * bpp)

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * stride]
    const scanline = raw.subarray(y * stride + 1, (y + 1) * stride)
    const reconScanline = Buffer.alloc(width * bpp)

    for (let i = 0; i < scanline.length; i++) {
      const a = i >= bpp ? reconScanline[i - bpp] : 0
      const b = prevScanline[i]
      const c = i >= bpp ? prevScanline[i - bpp] : 0

      let val = scanline[i]
      if (filterType === 0) {
        // None
      } else if (filterType === 1) {
        // Sub
        val = (val + a) & 0xff
      } else if (filterType === 2) {
        // Up
        val = (val + b) & 0xff
      } else if (filterType === 3) {
        // Average
        val = (val + Math.floor((a + b) / 2)) & 0xff
      } else if (filterType === 4) {
        // Paeth
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        let pr = c
        if (pa <= pb && pa <= pc) pr = a
        else if (pb <= pc) pr = b
        val = (val + pr) & 0xff
      }
      reconScanline[i] = val
    }

    prevScanline = reconScanline

    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4
      if (colorType === 2) {
        pixels[dstIdx] = reconScanline[x * 3]
        pixels[dstIdx + 1] = reconScanline[x * 3 + 1]
        pixels[dstIdx + 2] = reconScanline[x * 3 + 2]
        pixels[dstIdx + 3] = 255
      } else if (colorType === 6) {
        pixels[dstIdx] = reconScanline[x * 4]
        pixels[dstIdx + 1] = reconScanline[x * 4 + 1]
        pixels[dstIdx + 2] = reconScanline[x * 4 + 2]
        pixels[dstIdx + 3] = reconScanline[x * 4 + 3]
      }
    }
  }

  return { width, height, pixels }
}

function encodePngRGB(width, height, getPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bits
  ihdr[9] = 2 // Color type 2: RGB (solid, no alpha, white bg)
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const ihdrChunk = makeChunk('IHDR', ihdr)

  const raw = Buffer.alloc(height * (1 + width * 3))
  let ptr = 0

  for (let y = 0; y < height; y++) {
    raw[ptr++] = 0 // Filter 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, y)
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

// Resample source image with padding (safe area for adaptive icons)
function resizeAndPad(src, targetSize, scale) {
  const logoW = Math.round(targetSize * scale)
  const logoH = Math.round(targetSize * scale)
  const offsetX = Math.floor((targetSize - logoW) / 2)
  const offsetY = Math.floor((targetSize - logoH) / 2)

  return encodePngRGB(targetSize, targetSize, (x, y) => {
    const lx = x - offsetX
    const ly = y - offsetY
    if (lx < 0 || lx >= logoW || ly < 0 || ly >= logoH) {
      return [255, 255, 255] // Solid white background
    }

    // Bilinear interpolation
    const gx = (lx / (logoW - 1)) * (src.width - 1)
    const gy = (ly / (logoH - 1)) * (src.height - 1)
    const x0 = Math.floor(gx)
    const x1 = Math.min(x0 + 1, src.width - 1)
    const y0 = Math.floor(gy)
    const y1 = Math.min(y0 + 1, src.height - 1)
    const dx = gx - x0
    const dy = gy - y0

    const idx00 = (y0 * src.width + x0) * 4
    const idx10 = (y0 * src.width + x1) * 4
    const idx01 = (y1 * src.width + x0) * 4
    const idx11 = (y1 * src.width + x1) * 4

    const r = Math.round(
      (1 - dx) * (1 - dy) * src.pixels[idx00] +
        dx * (1 - dy) * src.pixels[idx10] +
        (1 - dx) * dy * src.pixels[idx01] +
        dx * dy * src.pixels[idx11],
    )
    const g = Math.round(
      (1 - dx) * (1 - dy) * src.pixels[idx00 + 1] +
        dx * (1 - dy) * src.pixels[idx10 + 1] +
        (1 - dx) * dy * src.pixels[idx01 + 1] +
        dx * dy * src.pixels[idx11 + 1],
    )
    const b = Math.round(
      (1 - dx) * (1 - dy) * src.pixels[idx00 + 2] +
        dx * (1 - dy) * src.pixels[idx10 + 2] +
        (1 - dx) * dy * src.pixels[idx01 + 2] +
        dx * dy * src.pixels[idx11 + 2],
    )

    return [r, g, b]
  })
}

function buildIco(png16, png32, png48) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(3, 4)

  const entries = []
  let offset = 6 + 3 * 16

  const images = [
    { size: 16, buf: png16 },
    { size: 32, buf: png32 },
    { size: 48, buf: png48 },
  ]

  for (const img of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(img.size, 0)
    entry.writeUInt8(img.size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(24, 6)
    entry.writeUInt32LE(img.buf.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += img.buf.length
  }

  return Buffer.concat([header, ...entries, png16, png32, png48])
}

console.log('Reading source logo from', sourcePath)
const srcBuf = fs.readFileSync(sourcePath)
const decoded = decodePng(srcBuf)
console.log(`Decoded source logo: ${decoded.width}x${decoded.height}`)

// pwa-192.png: 192x192 with safe padding (0.85 scale on white background)
console.log('Generating pwa-192.png...')
const pwa192 = resizeAndPad(decoded, 192, 0.85)
fs.writeFileSync(path.join(publicDir, 'pwa-192.png'), pwa192)

// pwa-512.png: 512x512 with safe padding (0.85 scale on white background)
console.log('Generating pwa-512.png...')
const pwa512 = resizeAndPad(decoded, 512, 0.85)
fs.writeFileSync(path.join(publicDir, 'pwa-512.png'), pwa512)

// apple-touch-icon.png: 180x180 solid opaque background (0.90 scale on white background)
console.log('Generating apple-touch-icon.png...')
const apple180 = resizeAndPad(decoded, 180, 0.9)
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), apple180)

// Favicons
console.log('Generating favicon PNGs and ICO...')
const fav16 = resizeAndPad(decoded, 16, 0.95)
const fav32 = resizeAndPad(decoded, 32, 0.95)
const fav48 = resizeAndPad(decoded, 48, 0.95)
fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), fav32)
fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), fav16)

const icoBuf = buildIco(fav16, fav32, fav48)
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf)

console.log('Finished generating all public icons!')
