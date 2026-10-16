migrate(
  (app) => {
    // Migration 0048: Expiração de convocações pendentes de datas passadas
    // Parte 1: Todas as convocacoes com status='pendente' cuja escala (campo escala -> escalas.data)
    // tenha data ANTERIOR ao dia de hoje (fuso America/Sao_Paulo: UTC-3) -> status 'cancelada',
    // regra_aplicada 'Expirada — oferta não aceita até o fim do dia do turno'.
    // Nenhuma convocação aceita, recusada, cancelada, coberta ou falta é tocada.
    // Nenhum payout é criado ou alterado.
    // Idempotente.

    // Cálculo da data civil de HOJE no fuso America/Sao_Paulo (UTC-3: 3 * 3600 * 1000 ms)
    const agoraUtcMs = new Date().getTime()
    const spMs = agoraUtcMs - 3 * 60 * 60 * 1000
    const dSp = new Date(spMs)
    const yyyy = dSp.getUTCFullYear()
    const mm = String(dSp.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dSp.getUTCDate()).padStart(2, '0')
    const agoraSp = `${yyyy}-${mm}-${dd}`

    const sql = `
      UPDATE convocacoes
      SET status = 'cancelada',
          regra_aplicada = 'Expirada — oferta não aceita até o fim do dia do turno',
          updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
      WHERE status = 'pendente'
        AND escala IN (
          SELECT id FROM escalas WHERE substr(data, 1, 10) < {:hojeSp}
        )
    `

    app.db().newQuery(sql).bind({ hojeSp: agoraSp }).execute()
    console.log(
      `[MIGRATION_0048] Convocações pendentes com escala anterior a ${agoraSp} foram expiradas com sucesso.`,
    )
  },
  (app) => {
    // Revert opcional (no-op para manter integridade dos dados históricos)
  },
)
