// Temporary script to fetch and inspect the logo PNG
const https = require('https')
const fs = require('fs')

const url =
  'https://facilities-b2b-convocacao-ae810.shrd00.internal.goskip.dev/api/files/pbc_2769025244/vuzgjq2y65cqy5o/logo_housekeeping_novo_favicon_quadrado_wsougwhve9.png'

https
  .get(url, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      const buf = Buffer.concat(chunks)
      console.log('Status:', res.statusCode)
      console.log('Size:', buf.length, 'bytes')
      console.log('Header:', buf.subarray(0, 8))
      // PNG IHDR is at offset 8 (length 4 bytes, 'IHDR', 13 bytes data)
      if (buf.length > 24) {
        const width = buf.readUInt32BE(16)
        const height = buf.readUInt32BE(20)
        const bitDepth = buf[24]
        const colorType = buf[25]
        console.log(
          `Dimensions: ${width}x${height}, bitDepth: ${bitDepth}, colorType: ${colorType}`,
        )
      }
      fs.writeFileSync('temp_logo.png', buf)
    })
  })
  .on('error', (err) => {
    console.error('Fetch error:', err)
  })
