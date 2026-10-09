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

  // 5. Carregar biblioteca VAPID via require isolado do handler e gerar chaves P-256
  let VAPID = null
  try {
    VAPID = require(`${__hooks}/lib_vapid.js`)
  } catch (errRequire) {
    const errMsg = errRequire && errRequire.stack ? errRequire.stack : String(errRequire)
    console.log('[GERAR_VAPID] Erro ao carregar módulo lib_vapid.js: ' + errMsg)
    return e.json(500, {
      error: 'Falha ao carregar módulo VAPID: ' + String(errRequire),
    })
  }

  if (!VAPID || !VAPID.generateVapidKeyPair) {
    console.log('[GERAR_VAPID] Falha: Módulo VAPID carregado mas generateVapidKeyPair indisponível')
    return e.json(500, {
      error: 'Biblioteca VAPID carregada mas generateVapidKeyPair indisponível.',
    })
  }

  let keyPair = null
  try {
    keyPair = VAPID.generateVapidKeyPair()
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
