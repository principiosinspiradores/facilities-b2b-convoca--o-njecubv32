const fs = require('fs')
const zlib = require('zlib')

const buf = fs.readFileSync('temp_logo.png')

// Parse PNG chunks
let pos = 8
const chunks = []
let width = 0,
  height = 0,
  bitDepth = 0,
  colorType = 0
const idatBuffers = []

while (pos < buf.length) {
  const len = buf.readUInt32BE(pos)
  const type = buf.subarray(pos + 4, pos + 8).toString('ascii')
  const data = buf.subarray(pos + 8, pos + 8 + len)
  chunks.push({ type, len, offset: pos })

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

const uncompressed = zlib.inflateSync(Buffer.concat(idatBuffers))

fs.writeFileSync(
  'temp_png_analysis.txt',
  JSON.stringify(
    {
      fileSize: buf.length,
      width,
      height,
      bitDepth,
      colorType,
      uncompressedLen: uncompressed.length,
      expectedLen: height * (1 + width * (colorType === 6 ? 4 : colorType === 2 ? 3 : 1)),
      chunks: chunks.map((c) => `${c.type} (${c.len})`),
    },
    null,
    2,
  ),
)
