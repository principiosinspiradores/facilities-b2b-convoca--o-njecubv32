// pocketbase/hooks/cron_confirmacao_presenca.js
// Cron agendado (executa a cada 10 min):
// 1. A cada 10 minutos, buscar convocações status='aceita' cujo turno (escala.data + expand.escala.turno_inicio, fuso SP)
//    comece entre 55 e 70 minutos à frente e confirmacao_presenca='nao_confirmada' (ou vazio)
//    -> push à pro: "Seu turno no [posto] começa às HH:MM — confirme sua presença no app" (mesma infra do cron lembrete existente).
//    Idempotente: tag 'confirmacao-presenca-<convId>-<hojeStr>' no push_outbox.
// 2. Alerta à gestão ~45 min antes do turno para turnos de hoje ainda 'nao_confirmada' (janela entre 40 e 50 minutos à frente)
//    -> push aos usuários role 'empresa' e 'admin':
//    "Turno [posto] às HH:MM sem confirmação de [pro] — confirme por telefone"
//    Idempotente: tag 'alerta-gestao-confirmacao-<convId>-<hojeStr>'.

cronAdd('confirmacao_presenca_turno', '*/10 * * * *', () => {
  // Obter VAPID via lib_vapid.js (carregada globalmente pelo runtime ou fallback embutido)
  const VAPID = (typeof globalThis !== 'undefined' && globalThis.VAPID) ||
    (typeof VAPID !== 'undefined' && VAPID) || {
      getVapidCredentials: () => {
        let pubKey = ''
        let privKey = ''
        let subject = 'mailto:contato@housekeeping.com.br'
        try {
          if (typeof $app !== 'undefined' && $app) {
            const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
            if (sList && sList.length > 0) {
              pubKey = sList[0].getString('vapid_public_key') || ''
              privKey = sList[0].getString('vapid_private_key') || ''
              subject = sList[0].getString('vapid_subject') || subject
            }
          }
        } catch (_) {}
        return { publicKey: pubKey, privateKey: privKey, subject: subject }
      },
      sendPushNotification: () => ({ success: false, error: 'VAPID indisponível' }),
    }

  const agoraUtcMs = new Date().getTime()
  // Fuso America/Sao_Paulo (UTC-3 fixo)
  const spOffsetMs = -3 * 60 * 60 * 1000
  const dSp = new Date(agoraUtcMs + spOffsetMs)
  const yyyy = dSp.getUTCFullYear()
  const mm = String(dSp.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dSp.getUTCDate()).padStart(2, '0')
  const hojeSpStr = `${yyyy}-${mm}-${dd}`

  try {
    const convocacoesAceitas = $app.findRecordsByFilter(
      'convocacoes',
      "status = 'aceita' && (confirmacao_presenca = 'nao_confirmada' || confirmacao_presenca = '' || confirmacao_presenca = null)",
      '-created',
      500,
      0,
    )

    if (!convocacoesAceitas || convocacoesAceitas.length === 0) {
      return
    }

    const creds = VAPID.getVapidCredentials()
    const vapidConfigurado = !!(creds.publicKey && creds.privateKey)
    const outboxCol = $app.findCollectionByNameOrId('push_outbox')

    // Carregar gestores (admin + empresa) uma única vez se houver alertas
    let gestoresCache = null
    const obterGestores = () => {
      if (!gestoresCache) {
        try {
          gestoresCache = $app.findRecordsByFilter(
            'users',
            "role = 'admin' || role = 'empresa'",
            'created',
            50,
            0,
          )
        } catch (_) {
          gestoresCache = []
        }
      }
      return gestoresCache
    }

    for (let i = 0; i < convocacoesAceitas.length; i++) {
      const conv = convocacoesAceitas[i]
      const convId = conv.id
      const proId = conv.getString('pro')
      const escalaId = conv.getString('escala')
      if (!proId || !escalaId) continue

      let escala = null
      try {
        escala = $app.findRecordById('escalas', escalaId)
      } catch (_) {
        continue
      }
      if (!escala) continue

      const escalaStatus = escala.getString('status')
      if (
        escalaStatus === 'falta' ||
        escalaStatus === 'cancelada' ||
        escalaStatus === 'concluida'
      ) {
        continue
      }

      // Checar data da escala: somente escalas de HOJE (fuso SP)
      const dataEscalaStr = (escala.getString('data') || '').slice(0, 10)
      if (dataEscalaStr !== hojeSpStr) {
        continue
      }

      // Horário de início do turno
      const turnoInicioStr = (escala.getString('turno_inicio') || '08:00').trim()
      const partesHora = turnoInicioStr.split(':')
      const hIni = parseInt(partesHora[0] || '8', 10)
      const mIni = parseInt(partesHora[1] || '0', 10)

      // Timestamp do turno em UTC (sabendo que o turno está em UTC-3)
      // dataEscalaStr: YYYY-MM-DD. Em UTC-3: YYYY-MM-DDT(hIni):(mIni):00-03:00
      const turnoUtcMs = Date.UTC(
        parseInt(dataEscalaStr.slice(0, 4), 10),
        parseInt(dataEscalaStr.slice(5, 7), 10) - 1,
        parseInt(dataEscalaStr.slice(8, 10), 10),
        hIni + 3, // compensar UTC-3 para UTC
        mIni,
        0,
      )

      // Minutos até o início do turno
      const minutosAteTurno = Math.floor((turnoUtcMs - agoraUtcMs) / (1000 * 60))

      // Obter nome do posto
      let postoNome = 'Posto'
      try {
        const postoId = escala.getString('posto')
        if (postoId) {
          const postoRec = $app.findRecordById('postos', postoId)
          postoNome = postoRec.getString('nome') || postoNome
        }
      } catch (_) {}

      // -------------------------------------------------------------
      // DISPARO 1: Push à PRO entre 55 e 70 minutos à frente
      // -------------------------------------------------------------
      if (minutosAteTurno >= 55 && minutosAteTurno <= 70) {
        const tagPro = `confirmacao-presenca-${convId}-${hojeSpStr}`
        let jaEnviadoPro = false
        try {
          const ja = $app.findRecordsByFilter('push_outbox', `tag = '${tagPro}'`, '-created', 1, 0)
          if (ja && ja.length > 0) jaEnviadoPro = true
        } catch (_) {}

        if (!jaEnviadoPro) {
          const pushTitle = 'Confirmação de Presença'
          const pushBody = `Seu turno no ${postoNome} começa às ${turnoInicioStr} — confirme sua presença no app`
          const pushUrl = '/minhas-escalas'

          let subs = []
          try {
            subs = $app.findRecordsByFilter(
              'push_subscriptions',
              `user = '${proId}'`,
              '-created',
              10,
              0,
            )
          } catch (_) {}

          if (!subs || subs.length === 0) {
            try {
              const outboxRec = new Record(outboxCol)
              outboxRec.set('user', proId)
              outboxRec.set('endpoint', '')
              outboxRec.set('title', pushTitle)
              outboxRec.set('body', pushBody)
              outboxRec.set('url', pushUrl)
              outboxRec.set('tag', tagPro)
              outboxRec.set('lido', false)
              $app.save(outboxRec)
            } catch (_) {}
          } else {
            for (let s = 0; s < subs.length; s++) {
              const sub = subs[s]
              const ep = sub.getString('endpoint')
              try {
                const outboxRec = new Record(outboxCol)
                outboxRec.set('user', proId)
                outboxRec.set('endpoint', ep)
                outboxRec.set('title', pushTitle)
                outboxRec.set('body', pushBody)
                outboxRec.set('url', pushUrl)
                outboxRec.set('tag', tagPro)
                outboxRec.set('lido', false)
                $app.save(outboxRec)
              } catch (_) {}

              if (vapidConfigurado && ep && typeof VAPID.sendPushNotification === 'function') {
                try {
                  VAPID.sendPushNotification(
                    ep,
                    {
                      title: pushTitle,
                      body: pushBody,
                      url: pushUrl,
                      icon: '/favicon.ico',
                      badge: '/favicon.ico',
                      tag: tagPro,
                    },
                    { urgency: 'high', ttl: 3600 },
                  )
                } catch (_) {}
              }
            }
          }
        }
      }

      // -------------------------------------------------------------
      // DISPARO 2: Alerta à GESTÃO ~45 min antes (janela 40 a 50 min)
      // Turnos de hoje ainda 'nao_confirmada'
      // "Turno [posto] às HH:MM sem confirmação de [pro] — confirme por telefone"
      // -------------------------------------------------------------
      if (minutosAteTurno >= 40 && minutosAteTurno <= 50) {
        const tagGestao = `alerta-gestao-confirmacao-${convId}-${hojeSpStr}`
        let jaEnviadoGestao = false
        try {
          const ja = $app.findRecordsByFilter(
            'push_outbox',
            `tag = '${tagGestao}'`,
            '-created',
            1,
            0,
          )
          if (ja && ja.length > 0) jaEnviadoGestao = true
        } catch (_) {}

        if (!jaEnviadoGestao) {
          let proNome = 'Profissional'
          try {
            const proRec = $app.findRecordById('users', proId)
            proNome = proRec.getString('name') || proNome
          } catch (_) {}

          const pushTitle = 'Turno sem Confirmação'
          const pushBody = `Turno ${postoNome} às ${turnoInicioStr} sem confirmação de ${proNome} — confirme por telefone`
          const pushUrl = '/escalas'

          const gestores = obterGestores()
          for (let g = 0; g < gestores.length; g++) {
            const gestor = gestores[g]
            const gestorId = gestor.id

            let gSubs = []
            try {
              gSubs = $app.findRecordsByFilter(
                'push_subscriptions',
                `user = '${gestorId}'`,
                '-created',
                10,
                0,
              )
            } catch (_) {}

            if (!gSubs || gSubs.length === 0) {
              try {
                const outboxRec = new Record(outboxCol)
                outboxRec.set('user', gestorId)
                outboxRec.set('endpoint', '')
                outboxRec.set('title', pushTitle)
                outboxRec.set('body', pushBody)
                outboxRec.set('url', pushUrl)
                outboxRec.set('tag', tagGestao)
                outboxRec.set('lido', false)
                $app.save(outboxRec)
              } catch (_) {}
            } else {
              for (let s = 0; s < gSubs.length; s++) {
                const sub = gSubs[s]
                const ep = sub.getString('endpoint')
                try {
                  const outboxRec = new Record(outboxCol)
                  outboxRec.set('user', gestorId)
                  outboxRec.set('endpoint', ep)
                  outboxRec.set('title', pushTitle)
                  outboxRec.set('body', pushBody)
                  outboxRec.set('url', pushUrl)
                  outboxRec.set('tag', tagGestao)
                  outboxRec.set('lido', false)
                  $app.save(outboxRec)
                } catch (_) {}

                if (vapidConfigurado && ep && typeof VAPID.sendPushNotification === 'function') {
                  try {
                    VAPID.sendPushNotification(
                      ep,
                      {
                        title: pushTitle,
                        body: pushBody,
                        url: pushUrl,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: tagGestao,
                      },
                      { urgency: 'high', ttl: 3600 },
                    )
                  } catch (_) {}
                }
              }
            }
          }
        }
      }
    }
  } catch (errGeral) {
    console.log('[CRON_CONFIRMACAO_PRESENCA] Erro geral:', errGeral)
  }
})
