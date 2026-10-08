// pocketbase/hooks/hook_ponto_push_atraso.js
// Dispara notificação push quando um ponto é registrado fora da janela (atraso) ou sincronizado com atraso relevante
// Destinatários: Usuários da empresa associada ao posto e administradores

onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const tipo = record.getString('tipo')
  const foraJanela = record.getBool('fora_janela')
  const ocorrencia = record.getString('ocorrencia') || ''
  const atrasoSync = record.getInt('atraso_sincronizacao_minutos') || 0

  const isAtraso =
    foraJanela || ocorrencia.toLowerCase().indexOf('atrasad') >= 0 || atrasoSync >= 15
  if (!isAtraso) return

  try {
    const proId = record.getString('pro')
    const escalaId = record.getString('escala')

    let proNome = 'Profissional'
    try {
      const proUser = $app.findRecordById('users', proId)
      proNome = proUser.getString('name') || proUser.email() || 'Profissional'
    } catch (_) {}

    let postoNome = 'Posto'
    let dataEscala = ''
    try {
      if (escalaId) {
        const esc = $app.findRecordById('escalas', escalaId)
        dataEscala = esc.getString('data').slice(0, 10)
        const postoRec = $app.findRecordById('postos', esc.getString('posto'))
        postoNome = postoRec.getString('nome')
      }
    } catch (_) {}

    const pushTitle = 'Atraso registrado no ponto'
    let pushBody = `${proNome} registrou ${tipo === 'chegada' ? 'chegada' : 'saída'} com atraso no posto ${postoNome}.`
    if (ocorrencia) {
      pushBody += ` (${ocorrencia.slice(0, 60)})`
    }
    const pushUrl = '/conferencia-ponto'

    const gestores = $app.findRecordsByFilter(
      'users',
      "(role = 'empresa' || role = 'admin') && status = 'ativo'",
      '-created',
      20,
      0,
    )

    for (let g = 0; g < gestores.length; g++) {
      const gestorId = gestores[g].id
      const subs = $app.findRecordsByFilter(
        'push_subscriptions',
        "user = '" + gestorId + "'",
        '-created',
        10,
        0,
      )
      for (let s = 0; s < subs.length; s++) {
        const sub = subs[s]
        const ep = sub.getString('endpoint')
        try {
          const res = $http.send({
            url: ep,
            method: 'POST',
            headers: {
              TTL: '86400',
              Urgency: 'normal',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: pushTitle,
              body: pushBody,
              url: pushUrl,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: 'ponto-atraso-' + record.id,
            }),
            timeout: 8,
          })
          if (res.statusCode === 404 || res.statusCode === 410) {
            $app.delete(sub)
          }
        } catch (subErr) {
          console.log('[PUSH] Erro ao enviar push de atraso no ponto:', subErr)
        }
      }
    }
  } catch (errGeral) {
    console.log('[PUSH] Erro geral no hook_ponto_push_atraso:', errGeral)
  }
}, 'pontos')
