// pocketbase/hooks/cron_expirar_convocacoes.js
// Job diário de expiração de convocações pendentes.
// Agendamento: 23:55 no horário de Brasília / São Paulo (America/Sao_Paulo: UTC-3).
// Como cronAdd utiliza horários em UTC na engine do PocketBase:
// 23:55 (UTC-3) equivale a 02:55 UTC do dia seguinte ('55 2 * * *').
// Executa a regra do turno: convocações com status='pendente' cuja escala.data seja menor ou igual a HOJE
// no fuso America/Sao_Paulo -> status 'cancelada', regra_aplicada 'Expirada — oferta não aceita até o fim do dia do turno'.
// Não altera escalas nem cria eventos punitivos ou de falta.

cronAdd('expirar_convocacoes_pendentes', '55 2 * * *', () => {
  const agoraUtcMs = new Date().getTime()
  // Fuso America/Sao_Paulo (UTC-3: 3 * 3600 * 1000 ms)
  const spMs = agoraUtcMs - 3 * 60 * 60 * 1000
  const dSp = new Date(spMs)
  const yyyy = dSp.getUTCFullYear()
  const mm = String(dSp.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dSp.getUTCDate()).padStart(2, '0')
  const hojeSp = `${yyyy}-${mm}-${dd}`

  console.log(
    `[CRON_EXPIRACAO] Iniciando expiração de convocações pendentes com escala.data <= ${hojeSp}`,
  )

  try {
    const sql = `
      UPDATE convocacoes
      SET status = 'cancelada',
          regra_aplicada = 'Expirada — oferta não aceita até o fim do dia do turno',
          updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
      WHERE status = 'pendente'
        AND escala IN (
          SELECT id FROM escalas WHERE substr(data, 1, 10) <= {:hojeSp}
        )
    `

    $app.db().newQuery(sql).bind({ hojeSp: hojeSp }).execute()
    console.log(
      `[CRON_EXPIRACAO] Expiração de convocações pendentes concluída com sucesso para data limite ${hojeSp}.`,
    )
  } catch (err) {
    console.log('[CRON_EXPIRACAO] Erro ao expirar convocações pendentes:', err)
  }
})

// Rota auxiliar POST para trigger manual ou simulação (ex.: testes autenticados / supervisão)
routerAdd('POST', '/backend/v1/custom/expirar-convocacoes', (e) => {
  const agoraUtcMs = new Date().getTime()
  const spMs = agoraUtcMs - 3 * 60 * 60 * 1000
  const dSp = new Date(spMs)
  const yyyy = dSp.getUTCFullYear()
  const mm = String(dSp.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dSp.getUTCDate()).padStart(2, '0')
  const hojeSp = `${yyyy}-${mm}-${dd}`

  console.log(
    `[ROUTER_EXPIRACAO] Trigger manual: expiração de convocações pendentes com escala.data <= ${hojeSp}`,
  )

  try {
    const sql = `
      UPDATE convocacoes
      SET status = 'cancelada',
          regra_aplicada = 'Expirada — oferta não aceita até o fim do dia do turno',
          updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
      WHERE status = 'pendente'
        AND escala IN (
          SELECT id FROM escalas WHERE substr(data, 1, 10) <= {:hojeSp}
        )
    `

    $app.db().newQuery(sql).bind({ hojeSp: hojeSp }).execute()
    return e.json(200, {
      success: true,
      hojeSp: hojeSp,
      message: 'Expiração executada com sucesso.',
    })
  } catch (err) {
    console.log('[ROUTER_EXPIRACAO] Erro ao expirar convocações pendentes:', err)
    return e.json(500, { success: false, error: String(err) })
  }
})
