// pocketbase/hooks/hook_validar_escala_duplicada.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Trava anti-duplicação de criação de escalas no backend:
 * Permite criar escalas com vagas=1 até completar o total de vagas configurado para o posto no dia/turno.
 * Bloqueia apenas quando a quantidade de escalas ativas (status != 'cancelada')
 * já atingir ou exceder o número de vagas do posto (ou quando vagas solicitadas já estiverem preenchidas).
 * Vaga extra (observacao ~ 'vaga extra' ou padronização) passa livre.
 */
onRecordCreate((e) => {
  const record = e.record
  const observacao = (record.getString('observacao') || '').toLowerCase()

  // Se a criação for uma vaga extra legítima ou padronização de modelo, pula o bloqueio de duplicidade
  if (
    observacao.indexOf('vaga extra') >= 0 ||
    observacao.indexOf('padronização 1 vaga') >= 0 ||
    observacao.indexOf('padronizacao 1 vaga') >= 0
  ) {
    e.next()
    return
  }

  const postoId = record.getString('posto')
  const rawData = record.getString('data')
  const turnoInicio = record.getString('turno_inicio')
  const turnoFim = record.getString('turno_fim')

  if (!postoId || !rawData || !turnoInicio || !turnoFim) {
    e.next()
    return
  }

  const dataDia = rawData.slice(0, 10)

  try {
    // Buscar posto para saber quantas vagas são configuradas por dia/turno
    let vagasDoPosto = 1
    try {
      const postoRecord = $app.findRecordById('postos', postoId)
      if (postoRecord) {
        vagasDoPosto = Math.max(1, postoRecord.getInt('vagas') || 1)
      }
    } catch (_) {
      vagasDoPosto = 1
    }

    const existentes = $app.findRecordsByFilter(
      'escalas',
      `posto = '${postoId}' && data ~ '${dataDia}' && turno_inicio = '${turnoInicio}' && turno_fim = '${turnoFim}' && status != 'cancelada'`,
      '-created',
      50,
      0,
    )

    // Se já temos tantas escalas ativas quanto o número de vagas do posto para esse dia/turno,
    // bloquear a criação de novas escalas redundantes
    if (existentes && existentes.length >= vagasDoPosto) {
      console.log(
        `[TRAVA_ESCALA] Vagas completas atingidas para posto ${postoId} em ${dataDia} (${turnoInicio}-${turnoFim}): ${existentes.length}/${vagasDoPosto}.`,
      )

      throw new BadRequestError(
        `Já existem todas as ${vagasDoPosto} vaga(s) cadastradas para este posto em ${dataDia} no horário ${turnoInicio} às ${turnoFim}. Use 'Adicionar vaga extra' se necessitar de vagas adicionais.`,
      )
    }
  } catch (err) {
    if (
      err.status === 400 ||
      (err.message &&
        (err.message.indexOf('Já existem todas as') >= 0 ||
          err.message.indexOf('Já existe uma escala') >= 0))
    ) {
      throw err
    }
    console.log('[TRAVA_ESCALA] Erro ao verificar duplicidade de escala:', err)
  }

  e.next()
}, 'escalas')
