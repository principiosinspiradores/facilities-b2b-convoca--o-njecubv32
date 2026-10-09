// pocketbase/hooks/router_gerar_vapid.js
// Rota para geração nativa de chaves VAPID (P-256 / ES256) com salvamento em settings

routerAdd('POST', '/backend/v1/push/gerar-vapid', (e) => {
  // 1. Validar autenticação e autorização (exclusivo admin)
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(403, { error: 'Acesso negado: autenticação necessária.' })
  }

  const callerRole = authRecord.getString('role')
  if (callerRole !== 'admin') {
    return e.json(403, {
      error: 'Acesso negado: apenas administradores podem gerar chaves VAPID.',
    })
  }

  // 2. Extrair parâmetro force (via query ou body)
  let force = false
  try {
    const forceQuery = e.request.url.query().get('force')
    if (forceQuery === 'true' || forceQuery === '1') {
      force = true
    }
  } catch (_) {}

  if (!force) {
    try {
      const info = e.requestInfo()
      if (info && info.body && (info.body.force === true || info.body.force === 'true')) {
        force = true
      }
    } catch (_) {}
  }

  // 3. Buscar registro em settings
  let settingsRec = null
  try {
    const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
    if (sList && sList.length > 0) {
      settingsRec = sList[0]
    }
  } catch (errSettings) {
    console.log('[GERAR_VAPID] Erro ao buscar settings:', errSettings)
  }

  if (!settingsRec) {
    return e.json(500, {
      error: 'Registro da coleção settings não encontrado.',
    })
  }

  // 4. Se já existirem chaves gravadas e force !== true, recusar
  const existingPub = settingsRec.getString('vapid_public_key')
  const existingPriv = settingsRec.getString('vapid_private_key')
  if (existingPub && existingPriv && !force) {
    return e.json(409, {
      error: 'ALREADY_CONFIGURED',
      message:
        'Chaves já existentes — regenerar invalida as inscrições atuais dos aparelhos. Utilize force=true para confirmar.',
      publicKey: existingPub,
    })
  }

  // --- Função inline de geração de chaves ECDSA P-256 (RFC 8292 / ES256) dentro do handler ---
  function gerarParChavesVapidInterno() {
    const P = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF')
    const A = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC')
    const N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551')
    const Gx = BigInt('0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296')
    const Gy = BigInt('0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5')

    function mod(a, m) {
      const r = a % m
      return r >= 0n ? r : r + m
    }

    function modInverse(a, m) {
      let t = 0n,
        newt = 1n
      let r = m,
        newr = mod(a, m)
      while (newr !== 0n) {
        const q = r / newr
        let tmp = t - q * newt
        t = newt
        newt = tmp
        tmp = r - q * newr
        r = newr
        newr = tmp
      }
      if (r > 1n) throw new Error('Não inversível')
      if (t < 0n) t += m
      return t
    }

    const POINT_AT_INFINITY = { x: 1n, y: 1n, z: 0n }

    function isInfinity(pt) {
      return pt.z === 0n
    }

    function toAffine(pt) {
      if (isInfinity(pt)) return null
      const zInv = modInverse(pt.z, P)
      const zInv2 = mod(zInv * zInv, P)
      const zInv3 = mod(zInv2 * zInv, P)
      const x = mod(pt.x * zInv2, P)
      const y = mod(pt.y * zInv3, P)
      return { x, y }
    }

    function pointDouble(pt) {
      if (isInfinity(pt) || pt.y === 0n) return POINT_AT_INFINITY
      const X = pt.x,
        Y = pt.y,
        Z = pt.z
      const S = mod(4n * X * Y * Y, P)
      const Z2 = mod(Z * Z, P)
      const M = mod(3n * X * X + A * mod(Z2 * Z2, P), P)
      const nx = mod(M * M - 2n * S, P)
      const Y2 = mod(Y * Y, P)
      const Y4 = mod(Y2 * Y2, P)
      const ny = mod(M * (S - nx) - 8n * Y4, P)
      const nz = mod(2n * Y * Z, P)
      return { x: nx, y: ny, z: nz }
    }

    function pointAdd(p1, p2) {
      if (isInfinity(p1)) return p2
      if (isInfinity(p2)) return p1

      const Z1_2 = mod(p1.z * p1.z, P)
      const Z2_2 = mod(p2.z * p2.z, P)
      const U1 = mod(p1.x * Z2_2, P)
      const U2 = mod(p2.x * Z1_2, P)
      const S1 = mod(p1.y * mod(Z2_2 * p2.z, P), P)
      const S2 = mod(p2.y * mod(Z1_2 * p1.z, P), P)

      if (U1 === U2) {
        if (S1 !== S2) return POINT_AT_INFINITY
        return pointDouble(p1)
      }

      const H = mod(U2 - U1, P)
      const R = mod(S2 - S1, P)
      const H2 = mod(H * H, P)
      const H3 = mod(H2 * H, P)
      const nx = mod(R * R - H3 - 2n * U1 * H2, P)
      const ny = mod(R * (U1 * H2 - nx) - S1 * H3, P)
      const nz = mod(p1.z * p2.z * H, P)
      return { x: nx, y: ny, z: nz }
    }

    function pointMul(k, pt) {
      let curr = pt
      let res = POINT_AT_INFINITY
      let scalar = k
      while (scalar > 0n) {
        if ((scalar & 1n) === 1n) {
          res = pointAdd(res, curr)
        }
        curr = pointDouble(curr)
        scalar >>= 1n
      }
      return res
    }

    const BASE_POINT = { x: Gx, y: Gy, z: 1n }

    const K256 = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
      0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
      0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
      0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
      0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
      0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
      0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
      0xc67178f2,
    ]

    function rotr(n, x) {
      return (x >>> n) | (x << (32 - n))
    }

    function sha256(bytes) {
      let h0 = 0x6a09e667
      let h1 = 0xbb67ae85
      let h2 = 0x3c6ef372
      let h3 = 0xa54ff53a
      let h4 = 0x510e527f
      let h5 = 0x9b05688c
      let h6 = 0x1f83d9ab
      let h7 = 0x5be0cd19

      const len = bytes.length
      const bitLen = len * 8
      const padLen = len % 64 < 56 ? 56 - (len % 64) : 120 - (len % 64)
      const totalLen = len + padLen + 8
      const padded = new Uint8Array(totalLen)
      padded.set(bytes, 0)
      padded[len] = 0x80

      const hi = Math.floor(bitLen / 0x100000000)
      const lo = bitLen >>> 0
      padded[totalLen - 8] = (hi >>> 24) & 0xff
      padded[totalLen - 7] = (hi >>> 16) & 0xff
      padded[totalLen - 6] = (hi >>> 8) & 0xff
      padded[totalLen - 5] = hi & 0xff
      padded[totalLen - 4] = (lo >>> 24) & 0xff
      padded[totalLen - 3] = (lo >>> 16) & 0xff
      padded[totalLen - 2] = (lo >>> 8) & 0xff
      padded[totalLen - 1] = lo & 0xff

      const w = new Uint32Array(64)
      for (let offset = 0; offset < totalLen; offset += 64) {
        for (let i = 0; i < 16; i++) {
          const j = offset + i * 4
          w[i] =
            ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) >>> 0
        }
        for (let i = 16; i < 64; i++) {
          const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)
          const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
        }

        let a = h0,
          b = h1,
          c = h2,
          d = h3,
          e = h4,
          f = h5,
          g = h6,
          h = h7

        for (let i = 0; i < 64; i++) {
          const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
          const ch = (e & f) ^ (~e & g)
          const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0
          const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
          const maj = (a & b) ^ (a & c) ^ (b & c)
          const temp2 = (S0 + maj) >>> 0

          h = g
          g = f
          f = e
          e = (d + temp1) >>> 0
          d = c
          c = b
          b = a
          a = (temp1 + temp2) >>> 0
        }

        h0 = (h0 + a) >>> 0
        h1 = (h1 + b) >>> 0
        h2 = (h2 + c) >>> 0
        h3 = (h3 + d) >>> 0
        h4 = (h4 + e) >>> 0
        h5 = (h5 + f) >>> 0
        h6 = (h6 + g) >>> 0
        h7 = (h7 + h) >>> 0
      }

      const out = new Uint8Array(32)
      const view = new DataView(out.buffer)
      view.setUint32(0, h0)
      view.setUint32(4, h1)
      view.setUint32(8, h2)
      view.setUint32(12, h3)
      view.setUint32(16, h4)
      view.setUint32(20, h5)
      view.setUint32(24, h6)
      view.setUint32(28, h7)
      return out
    }

    function bits2int(bytes) {
      let res = 0n
      for (let i = 0; i < bytes.length; i++) {
        res = (res << 8n) | BigInt(bytes[i])
      }
      return res
    }

    function int2octets(x) {
      const bytes = new Uint8Array(32)
      let val = x
      for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(val & 0xffn)
        val >>= 8n
      }
      return bytes
    }

    const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    function bytesToBase64Url(bytes) {
      let str = ''
      const len = bytes.length
      for (let i = 0; i < len; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < len ? bytes[i + 1] : 0
        const b2 = i + 2 < len ? bytes[i + 2] : 0

        const c0 = b0 >> 2
        const c1 = ((b0 & 3) << 4) | (b1 >> 4)
        const c2 = ((b1 & 15) << 2) | (b2 >> 6)
        const c3 = b2 & 63

        str += B64_CHARS[c0] + B64_CHARS[c1]
        if (i + 1 < len) str += B64_CHARS[c2]
        if (i + 2 < len) str += B64_CHARS[c3]
      }
      return str
    }

    function stringToUtf8Bytes(str) {
      const bytes = []
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i)
        if (code < 0x80) {
          bytes.push(code)
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6))
          bytes.push(0x80 | (code & 0x3f))
        } else if (code < 0xd800 || code >= 0xe000) {
          bytes.push(0xe0 | (code >> 12))
          bytes.push(0x80 | ((code >> 6) & 0x3f))
          bytes.push(0x80 | (code & 0x3f))
        } else {
          i++
          code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
          bytes.push(0xf0 | (code >> 18))
          bytes.push(0x80 | ((code >> 12) & 0x3f))
          bytes.push(0x80 | ((code >> 6) & 0x3f))
          bytes.push(0x80 | (code & 0x3f))
        }
      }
      return new Uint8Array(bytes)
    }

    let privBigInt = 0n
    let privBytes = new Uint8Array(32)

    while (true) {
      const seed1 =
        typeof $security !== 'undefined' && $security && $security.randomString
          ? $security.randomString(64)
          : String(Math.random()) + String(Date.now())
      const seed2 =
        typeof $security !== 'undefined' && $security && $security.randomString
          ? $security.randomString(64)
          : String(Math.random()) + String(Date.now())

      const hash1 = sha256(stringToUtf8Bytes(seed1 + ':' + Date.now() + ':part1'))
      const hash2 = sha256(stringToUtf8Bytes(seed2 + ':' + Date.now() + ':part2'))

      for (let i = 0; i < 32; i++) {
        privBytes[i] = hash1[i] ^ hash2[31 - i]
      }

      privBigInt = bits2int(privBytes)
      if (privBigInt >= 1n && privBigInt < N) {
        break
      }
    }

    const pubPoint = toAffine(pointMul(privBigInt, BASE_POINT))
    if (!pubPoint) {
      throw new Error('Falha ao computar ponto público P-256')
    }

    const pubBytes = new Uint8Array(65)
    pubBytes[0] = 0x04
    pubBytes.set(int2octets(pubPoint.x), 1)
    pubBytes.set(int2octets(pubPoint.y), 33)

    return {
      publicKey: bytesToBase64Url(pubBytes),
      privateKey: bytesToBase64Url(privBytes),
      subject: 'mailto:contato@housekeeping.com.br',
    }
  }

  // 5. Carregar VAPID e gerar chaves P-256
  let VAPID = (typeof globalThis !== 'undefined' && globalThis.VAPID) || null
  if (!VAPID) {
    try {
      VAPID = require(`${__hooks}/lib_vapid.js`)
    } catch (_) {
      try {
        VAPID = require('./lib_vapid.js')
      } catch (_) {
        VAPID = require('lib_vapid.js')
      }
    }
  }

  let keyPair = null
  try {
    if (VAPID && typeof VAPID.generateVapidKeyPair === 'function') {
      keyPair = VAPID.generateVapidKeyPair()
    } else {
      keyPair = gerarParChavesVapidInterno()
    }
  } catch (errGen) {
    const errMsg = errGen && errGen.stack ? errGen.stack : String(errGen)
    console.log('[GERAR_VAPID] Erro ao gerar par de chaves: ' + errMsg)
    return e.json(500, {
      error: 'Erro ao gerar par de chaves P-256: ' + String(errGen),
    })
  }

  if (!keyPair || !keyPair.publicKey || !keyPair.privateKey) {
    return e.json(500, {
      error: 'Falha na geração do par de chaves VAPID.',
    })
  }

  // 6. Gravar os 3 campos em settings
  try {
    const fixedSubject = 'mailto:contato@housekeeping.com.br'
    settingsRec.set('vapid_public_key', keyPair.publicKey)
    settingsRec.set('vapid_private_key', keyPair.privateKey)
    settingsRec.set('vapid_subject', fixedSubject)
    $app.save(settingsRec)
  } catch (errSave) {
    const errSaveMsg = errSave && errSave.stack ? errSave.stack : String(errSave)
    console.log('[GERAR_VAPID] Erro ao salvar chaves em settings: ' + errSaveMsg)
    return e.json(500, {
      error: 'Erro ao gravar chaves na coleção settings: ' + String(errSave),
    })
  }

  return e.json(200, {
    success: true,
    message: 'Chaves VAPID geradas e configuradas com sucesso no sistema!',
    publicKey: keyPair.publicKey,
    subject: 'mailto:contato@housekeeping.com.br',
  })
})
