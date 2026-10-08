const fs = require('fs')

if (fs.existsSync('temp_logo.png')) {
  const stat = fs.statSync('temp_logo.png')
  const buf = fs.readFileSync('temp_logo.png')
  fs.writeFileSync(
    'temp_info.txt',
    `Downloaded size: ${stat.size}\nHeader: ${buf.subarray(0, 16).toString('hex')}`,
  )
} else {
  fs.writeFileSync('temp_info.txt', 'temp_logo.png does not exist')
}
