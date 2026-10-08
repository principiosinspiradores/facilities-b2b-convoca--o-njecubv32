migrate(
  (app) => {
    // Buscar todos os usuários role = 'pro'
    const pros = app.findRecordsByFilter('users', 'role = "pro"', '', 0, 0)

    for (let i = 0; i < pros.length; i++) {
      const pro = pros[i]
      let end = {}
      try {
        const rawEnd = pro.get('endereco_completo')
        if (typeof rawEnd === 'string') {
          end = JSON.parse(rawEnd || '{}')
        } else if (rawEnd && typeof rawEnd === 'object') {
          end = JSON.parse(JSON.stringify(rawEnd))
        }
      } catch (_) {
        end = {}
      }

      let modified = false

      // 1. Remover campo regiao se existir
      if ('regiao' in end) {
        delete end.regiao
        modified = true
      }

      // 2. Corrigir pro Natalia (id: e1idzk8kslnisju): endereco_completo.cidade de "São Paulo" para "Campinas"
      if (pro.id === 'e1idzk8kslnisju') {
        if (end.cidade !== 'Campinas') {
          end.cidade = 'Campinas'
          modified = true
        }
      }

      if (modified) {
        pro.set('endereco_completo', end)
        app.save(pro)
      }
    }
  },
  (app) => {
    // Reverter caso necessário: não reintroduzimos 'Grande São Paulo' arbitrariamente
  },
)
