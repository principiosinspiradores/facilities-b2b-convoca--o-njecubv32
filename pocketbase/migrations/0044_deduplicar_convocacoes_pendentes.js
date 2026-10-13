migrate(
  (app) => {
    // Migration 0044: Limpeza cirúrgica de convocações pendentes duplicadas
    // Regra: mesma escala + mesmo pro, com status 'pendente'.
    // Mantém SEMPRE a mais antiga de cada grupo (ordenada por created ASC).
    // Não toca em convocações com qualquer outro status (aceita, falta, recusada, cancelada).

    // Buscar todas as convocações pendentes ordenadas da mais antiga para a mais recente
    const pendentes = app.findRecordsByFilter(
      'convocacoes',
      "status = 'pendente'",
      'created',
      5000,
      0,
    )

    const vistos = {}
    let totalRemovidas = 0

    for (let i = 0; i < pendentes.length; i++) {
      const conv = pendentes[i]
      const escalaId = conv.getString('escala')
      const proId = conv.getString('pro')
      const chave = escalaId + '::' + proId

      if (!vistos[chave]) {
        // Primeira ocorrência = a mais antiga -> manter
        vistos[chave] = conv.id
      } else {
        // Ocorrência duplicada posterior -> remover
        console.log(
          `[MIGRATION_0044] Excluindo convocação pendente duplicada ${conv.id} (escala ${escalaId}, pro ${proId}). Mantida: ${vistos[chave]}`,
        )
        app.delete(conv)
        totalRemovidas++
      }
    }

    console.log(
      `[MIGRATION_0044] Concluída a limpeza de duplicatas. Total removidas: ${totalRemovidas}`,
    )
  },
  (app) => {
    // Revert irrelevante (registros duplicados deletados)
  },
)
