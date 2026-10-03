// pocketbase/hooks/hook_validar_atestado.js
// Processamento de aprovação e rejeição de Atestados Médicos
// Quando aprovado: falta abonada, cancela multa, registra evento 'abono_atestado' na trilha
// Quando rejeitado: aplica a multa que estava suspensa

onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status_validacao')
  const newStatus = record.getString('status_validacao')

  if (originalStatus === 'pendente' && (newStatus === 'aprovado' || newStatus === 'rejeitado')) {
    const convocacaoId = record.getString('convocacao')
    const proId = record.getString('pro')
    const obs = record.getString('observacao_validacao') || ''
    const now = new Date()

    let convocacao
    let escala
    let posto
    try {
      convocacao = $app.findRecordById('convocacoes', convocacaoId)
      if (convocacao) {
        escala = $app.findRecordById('escalas', convocacao.getString('escala'))
        if (escala) {
          posto = $app.findRecordById('postos', escala.getString('posto'))
        }
      }
    } catch (errFind) {
      console.log('Erro ao localizar convocação/escala do atestado:', errFind)
    }

    const postoNome = posto ? posto.getString('nome') : 'Posto'
    const dataEscala = escala ? escala.getString('data').slice(0, 10) : ''

    if (newStatus === 'aprovado') {
      // 1. Falta abonada:
      // Se houver algum payment_event de multa_falta já cobrado (caso tenha sido aplicado antes), registrar estorno
      // Cancelar cobranças de multa e registrar evento de abono
      try {
        const eventsCol = $app.findCollectionByNameOrId('payment_events')

        const ev = new Record(eventsCol)
        ev.set('tipo', 'ajuste')
        ev.set('valor', 0)
        ev.set('data', now.toISOString())
        ev.set('metadata', {
          motivo: 'Atestado médico aprovado - Falta abonada com isenção de multa',
          convocacao_id: convocacaoId,
          atestado_id: record.id,
          pro_id: proId,
          posto_nome: postoNome,
          data_turno: dataEscala,
          observacao: obs,
        })
        $app.save(ev)
      } catch (errEv) {
        console.log('Erro ao registrar evento de abono de atestado:', errEv)
      }
    } else if (newStatus === 'rejeitado') {
      // 2. Atestado rejeitado: aplicar a multa de no-show que havia sido suspensa
      try {
        let valorMulta = 50
        try {
          const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
          if (sList && sList.length > 0) {
            valorMulta = sList[0].getFloat('multa_falta_pro') || 50
          }
        } catch (_) {}

        // Verificar idempotência: não aplicar se já houver evento de multa_falta
        const existingEvents = $app.findRecordsByFilter(
          'payment_events',
          "tipo = 'multa_falta' && metadata ~ '" + convocacaoId + "'",
          '-created',
          1,
          0,
        )

        if (!existingEvents || existingEvents.length === 0) {
          const escalaId = convocacao ? convocacao.getString('escala') : ''
          const payouts = $app.findRecordsByFilter(
            'payouts',
            "escala = '" + escalaId + "' && pro = '" + proId + "' && status = 'retido'",
            '-created',
            1,
            0,
          )

          const eventsCol = $app.findCollectionByNameOrId('payment_events')

          if (payouts && payouts.length > 0) {
            const pay = payouts[0]
            pay.set('status', 'cancelado')
            $app.save(pay)

            const ev = new Record(eventsCol)
            ev.set('payout', pay.id)
            ev.set('tipo', 'multa_falta')
            ev.set('valor', -valorMulta)
            ev.set('data', now.toISOString())
            ev.set('metadata', {
              motivo: 'Falta confirmada após rejeição de atestado médico',
              escala_id: escalaId,
              pro_id: proId,
              convocacao_id: convocacaoId,
              atestado_id: record.id,
              multa_aplicada: valorMulta,
              justificativa_rejeicao: obs,
            })
            $app.save(ev)
          } else {
            const ev = new Record(eventsCol)
            ev.set('tipo', 'multa_falta')
            ev.set('valor', -valorMulta)
            ev.set('data', now.toISOString())
            ev.set('metadata', {
              motivo: 'Falta confirmada após rejeição de atestado médico (pro fixo/mensal)',
              escala_id: escalaId,
              pro_id: proId,
              convocacao_id: convocacaoId,
              atestado_id: record.id,
              multa_aplicada: valorMulta,
              justificativa_rejeicao: obs,
            })
            $app.save(ev)
          }
        }
      } catch (errRej) {
        console.log('Erro ao processar multa pós-rejeição de atestado:', errRej)
      }
    }
  }
}, 'atestados')
