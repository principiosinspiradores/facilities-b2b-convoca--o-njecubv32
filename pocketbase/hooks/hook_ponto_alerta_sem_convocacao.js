// pocketbase/hooks/hook_ponto_alerta_sem_convocacao.js
// Alerta imediato quando o profissional registra ponto sem convocação válida (não-intermediação)

onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const isAvisoSemConvocacao = record.getBool('aviso_sem_convocacao')
  if (!isAvisoSemConvocacao) return

  try {
    const proId = record.getString('pro')
    const postoId = record.getString('posto')
    const timestampReal = record.getString('timestamp_real') || new Date().toISOString()
    const dataFormatada = timestampReal.slice(0, 10)

    let proNome = 'Profissional'
    try {
      const proUser = $app.findRecordById('users', proId)
      if (proUser) {
        proNome = proUser.getString('name') || proUser.email() || 'Profissional'
      }
    } catch (_) {}

    let postoNome = 'Posto'
    try {
      if (postoId) {
        const postoRec = $app.findRecordById('postos', postoId)
        if (postoRec) {
          postoNome = postoRec.getString('nome') || 'Posto'
        }
      }
    } catch (_) {}

    const textoAlerta = `O profissional ${proNome} esteve no posto ${postoNome} em ${dataFormatada} sem convocação`

    // Buscar usuários da empresa e admin para alertar via chat interno
    const destinatarios = []
    try {
      const gestores = $app.findRecordsByFilter(
        'users',
        "(role = 'empresa' || role = 'admin') && status = 'ativo'",
        '-created',
        10,
        0,
      )
      for (let g = 0; g < gestores.length; g++) {
        destinatarios.push(gestores[g])
      }
    } catch (errG) {
      console.log('Erro ao buscar gestores para alerta sem convocação:', errG)
    }

    if (destinatarios.length === 0) return

    const conversasCol = $app.findCollectionByNameOrId('mensagens_conversas')
    const msgsCol = $app.findCollectionByNameOrId('mensagens_mensagens')

    for (let i = 0; i < destinatarios.length; i++) {
      const dest = destinatarios[i]
      try {
        const conv = new Record(conversasCol)
        conv.set('tipo', 'direta')
        conv.set('pro', proId)
        conv.set('participantes', [proId, dest.id])
        conv.set('titulo_contexto', `ALERTA DE PRESENÇA: ${postoNome}`)
        conv.set('ultima_mensagem_texto', textoAlerta)
        conv.set('ultima_mensagem_data', new Date().toISOString())
        $app.save(conv)

        const msg = new Record(msgsCol)
        msg.set('conversa', conv.id)
        msg.set('remetente', dest.id)
        msg.set('destinatario_tipo', 'empresa')
        msg.set('texto', textoAlerta)
        msg.set('lida', false)
        $app.save(msg)
      } catch (errEnvio) {
        console.log('Erro ao enviar mensagem de alerta de presença sem convocação:', errEnvio)
      }
    }
  } catch (errGeral) {
    console.log('Erro no hook_ponto_alerta_sem_convocacao:', errGeral)
  }
}, 'pontos')
