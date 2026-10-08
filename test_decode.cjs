const fs = require('fs')
const zlib = require('zlib')

function decodePngRGB(buf) {
  let pos = 8
  let width = 0,
    height = 0,
    bitDepth = 0,
    colorType = 0
  const idatBuffers = []

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii')
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
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
        let pr
        if (pa <= pb && pa <= pc) pr = a
        else if (pb <= pc) pr = b
        else pr = c
        val = (val + pr) & 0xff
      }
      reconScanline[i] = val
    }

    prevScanline = reconScanline

    // Convert to RGBA
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4
      if (colorType === 2) {
        // RGB
        pixels[dstIdx] = reconScanline[x * 3]
        pixels[dstIdx + 1] = reconScanline[x * 3 + 1]
        pixels[dstIdx + 2] = reconScanline[x * 3 + 2]
        pixels[dstIdx + 3] = 255
      } else if (colorType === 6) {
        // RGBA
        pixels[dstIdx] = reconScanline[x * 4]
        pixels[dstIdx + 1] = reconScanline[x * 4 + 1]
        pixels[dstIdx + 2] = reconScanline[x * 4 + 2]
        pixels[dstIdx + 3] = reconScanline[x * 4 + 3]
      }
    }
  }

  return { width, height, pixels }
}

const logoBuf = fs.readFileSync('temp_logo.png')
const decoded = decodePngRGB(logoBuf)

fs.writeFileSync(
  'temp_decoded.txt',
  JSON.stringify({
    width: decoded.width,
    height: decoded.height,
    pixelSampleTopLeft: [
      decoded.pixels[0],
      decoded.pixels[1],
      decoded.pixels[2],
      decoded.pixels[3],
    ],
    pixelSampleCenter: [
      decoded.pixels[(512 * 1024 + 512) * 4],
      decoded.pixels[(512 * 1024 + 512) * 4 + 1],
      decoded.pixels[(512 * 1024 + 512) * 4 + 2],
      decoded.pixels[(512 * 1024 + 512) * 4 + 3],
    ],
  }),
)
