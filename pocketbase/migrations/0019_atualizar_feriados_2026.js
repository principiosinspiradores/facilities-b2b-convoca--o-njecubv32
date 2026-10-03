migrate(
  (app) => {
    // 1. Apagar registros existentes da coleção holidays (especialmente com data em 2025)
    // O usuário solicitou substituir todos os registros de 2025 pela agenda oficial de 2026.
    try {
      app.db().newQuery("DELETE FROM holidays WHERE data LIKE '2025%'").execute()
    } catch (e) {
      console.log('Erro ao remover feriados 2025:', e)
    }

    const holidaysCol = app.findCollectionByNameOrId('holidays')

    // 2. Agenda de Feriados 2026
    // 12 Nacionais + 1 Municipal (Aniversário de São Paulo)
    const holidays2026 = [
      { data: '2026-01-01', nome: 'Ano Novo', tipo: 'nacional' },
      {
        data: '2026-01-25',
        nome: 'Aniversário de São Paulo',
        tipo: 'municipal',
        cidade: 'São Paulo',
        uf: 'SP',
      },
      { data: '2026-02-17', nome: 'Carnaval', tipo: 'nacional' },
      { data: '2026-04-03', nome: 'Sexta-feira da Paixão', tipo: 'nacional' },
      { data: '2026-04-21', nome: 'Tiradentes', tipo: 'nacional' },
      { data: '2026-05-01', nome: 'Dia do Trabalho', tipo: 'nacional' },
      { data: '2026-06-04', nome: 'Corpus Christi', tipo: 'nacional' },
      { data: '2026-09-07', nome: 'Independência do Brasil', tipo: 'nacional' },
      { data: '2026-10-12', nome: 'Nossa Senhora Aparecida', tipo: 'nacional' },
      { data: '2026-11-02', nome: 'Finados', tipo: 'nacional' },
      { data: '2026-11-15', nome: 'Proclamação da República', tipo: 'nacional' },
      { data: '2026-11-20', nome: 'Consciência Negra', tipo: 'nacional' },
      { data: '2026-12-25', nome: 'Natal', tipo: 'nacional' },
    ]

    for (const h of holidays2026) {
      // Idempotência: verificar se já existe com mesmo nome e ano
      try {
        const existing = app.findRecordsByFilter(
          'holidays',
          "nome = '" + h.nome + "' && data ~ '" + h.data.slice(0, 4) + "'",
          '',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          continue
        }
      } catch (_) {}

      const rec = new Record(holidaysCol)
      rec.set('data', h.data)
      rec.set('nome', h.nome)
      rec.set('tipo', h.tipo)
      if (h.cidade) rec.set('cidade', h.cidade)
      if (h.uf) rec.set('uf', h.uf)
      app.save(rec)
    }
  },
  (app) => {
    // Reverter: remover os feriados de 2026 inseridos
    try {
      app.db().newQuery("DELETE FROM holidays WHERE data LIKE '2026%'").execute()
    } catch (e) {
      console.log('Erro no rollback da migração 0019_atualizar_feriados_2026:', e)
    }
  },
)
