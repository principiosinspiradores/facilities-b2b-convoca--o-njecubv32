// pocketbase/hooks/hook_validar_escala_duplicada.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Trava anti-duplicação de criação de escalas no backend:
 * Antes de criar uma nova escala, verifica se já existe escala com o mesmo
 * posto + data (dia) + turno_inicio + turno_fim (status != 'cancelada').
 * Se já existir, NÃO cria duplicata; atualiza as vagas da existente se aplicável e bloqueia a criação redundante.
 */
onRecordCreate((e) => {
  const record = e.record
  const postoId = record.getString('posto')
  const rawData = record.getString('data')
  const turnoInicio = record.getString('turno_inicio')
  const turnoFim = record.getString('turno_fim')
  const novasVagas = record.getInt('vagas') || 1

  if (!postoId || !rawData || !turnoInicio || !turnoFim) {
    e.next()
    return
  }

  const dataDia = rawData.slice(0, 10)

  try {
    const existentes = $app.findRecordsByFilter(
      'escalas',
      `posto = '${postoId}' && data ~ '${dataDia}' && turno_inicio = '${turnoInicio}' && turno_fim = '${turnoFim}' && status != 'cancelada'`,
      '-created',
      10,
      0,
    )

    if (existentes && existentes.length > 0) {
      console.log(
        `[TRAVA_ESCALA] Escala duplicada detectada para posto ${postoId} em ${dataDia} (${turnoInicio}-${turnoFim}).`,
      )
      // Se aplicável, sincroniza o número de vagas da existente
      for (let i = 0; i < existentes.length; i++) {
        const escExistente = existentes[i]
        if (escExistente.getInt('vagas') !== novasVagas) {
          escExistente.set('vagas', novasVagas)
          $app.save(escExistente)
        }
      }

      // Impede a criação da duplicata levantando erro para o chamador
      throw new BadRequestError(
        `Já existe uma escala cadastrada para este posto em ${dataDia} no horário ${turnoInicio} às ${turnoFim}.`,
      )
    }
  } catch (err) {
    if (err.status === 400 || (err.message && err.message.indexOf('Já existe uma escala') >= 0)) {
      throw err
    }
    console.log('[TRAVA_ESCALA] Erro ao verificar duplicidade de escala:', err)
  }

  e.next()
}, 'escalas')
