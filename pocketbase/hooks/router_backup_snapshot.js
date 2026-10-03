// pocketbase/hooks/router_backup_snapshot.js
// Rota de backup completo da base para administradores

routerAdd('GET', '/backend/v1/admin/backup-snapshot', (e) => {
  // 1. Validar autenticação e autorização (somente role = 'admin')
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(403, { error: 'Acesso negado: autenticação necessária.' })
  }

  const role = authRecord.getString('role')
  if (role !== 'admin') {
    return e.json(403, {
      error: 'Acesso negado: apenas administradores podem gerar o snapshot da base.',
    })
  }

  // Versão do sistema
  const systemVersion = '0.0.20'
  const generatedAt = new Date().toISOString()
  const dateFormatted = generatedAt.slice(0, 10)

  // As 17 coleções especificadas (incluindo atestados)
  const collectionsToExport = [
    'users',
    'postos',
    'escalas',
    'convocacoes',
    'historico_escalas',
    'payouts',
    'payment_events',
    'disputas',
    'settings',
    'pricing_rules',
    'holidays',
    'funcoes',
    'conta_pix',
    'pontos',
    'mensagens_conversas',
    'mensagens_mensagens',
    'atestados',
  ]

  const snapshotData = {}
  const counts = {}
  const batchSize = 500

  for (let c = 0; c < collectionsToExport.length; c++) {
    const colName = collectionsToExport[c]
    const list = []
    let offset = 0

    while (true) {
      let batch = []
      try {
        batch = $app.findRecordsByFilter(colName, '', 'id', batchSize, offset)
      } catch (err) {
        // Se a coleção não existir ou der erro, continua
        break
      }

      if (!batch || batch.length === 0) {
        break
      }

      for (let i = 0; i < batch.length; i++) {
        const rec = batch[i]
        // Converter model para JSON puro
        let rawObj = {}
        try {
          rawObj = JSON.parse(JSON.stringify(rec))
        } catch (_) {
          rawObj = {}
        }

        // Sanitização específica para a coleção 'users'
        // REMOVER campos sensíveis de autenticação: passwordHash, tokenKey, emailVisibility internals, etc.
        // MANTER: nome, email, role, status, precificação do pro, funcoes, endereco e demais campos de perfil
        if (colName === 'users') {
          delete rawObj.passwordHash
          delete rawObj.tokenKey
          delete rawObj.emailVisibility
          delete rawObj.authAlertSent
          delete rawObj.lastResetSentAt
          delete rawObj.lastVerificationSentAt
          delete rawObj.oauth2Accounts
        }

        list.push(rawObj)
      }

      offset += batch.length
      if (batch.length < batchSize) {
        break
      }
    }

    snapshotData[colName] = list
    counts[colName] = list.length
  }

  // Atualizar campo settings.ultimo_snapshot_em com a data/hora atual
  try {
    const settingsList = $app.findRecordsByFilter('settings', '', '-created', 1, 0)
    if (settingsList && settingsList.length > 0) {
      const cfg = settingsList[0]
      cfg.set('ultimo_snapshot_em', generatedAt.replace('T', ' ').slice(0, 19))
      $app.save(cfg)
    }
  } catch (err) {
    // Não falhar o download se a gravação do registro settings falhar
  }

  const payload = {
    header: {
      generated_at: generatedAt,
      system_version: systemVersion,
      counts: counts,
      total_collections: collectionsToExport.length,
    },
    data: snapshotData,
  }

  const fileName = 'facilities-pro-backup-' + dateFormatted + '.json'
  e.response.header().set('Content-Disposition', 'attachment; filename=' + fileName)
  e.response.header().set('Content-Type', 'application/json')

  return e.json(200, payload)
})
