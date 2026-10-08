// pocketbase/hooks/router_get_logo_base64_json.js
routerAdd('GET', '/backend/v1/public/logo-base64', (e) => {
  const records = $app.findRecordsByFilter('settings', '', '-created', 1, 0)
  if (!records || records.length === 0) {
    return e.json(404, { error: 'Settings não encontrado' })
  }
  const s = records[0]
  const logoName = s.getString('logo')
  if (!logoName) {
    return e.json(404, { error: 'Logo não configurado' })
  }

  let fsys, reader
  try {
    fsys = $app.newFilesystem()
    const key = s.baseFilesPath() + '/' + logoName
    reader = fsys.getReader(key)

    // In pocketbase Goja: reader can be read or converted
    // Let's see if $filesystem or $security or reader has methods:
    // Let's inspect properties and methods of reader
    const props = []
    for (let k in reader) {
      props.push(k)
    }

    let rawStr = ''
    try {
      rawStr = toString(reader)
    } catch (err) {
      rawStr = 'ERR:' + String(err)
    }

    // Convert raw binary string to base64
    // Standard btoa in JS or byte array
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let b64 = ''
    let i = 0
    const len = rawStr.length
    while (i < len) {
      const b1 = rawStr.charCodeAt(i++) & 0xff
      const b2 = i < len ? rawStr.charCodeAt(i++) & 0xff : NaN
      const b3 = i < len ? rawStr.charCodeAt(i++) & 0xff : NaN

      const enc1 = b1 >> 2
      const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4)
      let enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6)
      let enc4 = isNaN(b3) ? 64 : b3 & 63

      b64 +=
        base64Chars.charAt(enc1) +
        base64Chars.charAt(enc2) +
        (enc3 === 64 ? '=' : base64Chars.charAt(enc3)) +
        (enc4 === 64 ? '=' : base64Chars.charAt(enc4))
    }

    return e.json(200, {
      logoName,
      length: len,
      props,
      b64,
    })
  } catch (err) {
    return e.json(500, { error: String(err) })
  } finally {
    if (reader) reader.close()
    if (fsys) fsys.close()
  }
})
