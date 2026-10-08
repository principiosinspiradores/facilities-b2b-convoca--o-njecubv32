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
          // Se for string JSON
          end = JSON.parse(rawEnd || '{}')
        } else if (Array.isArray(rawEnd)) {
          // Se os bytes vieram como array de números (ex: UTF-8 byte codes)
          let str = ''
          for (let b = 0; b < rawEnd.length; b++) {
            str += String.fromCharCode(rawEnd[b])
          }
          // Decodificar UTF-8 se necessário
          try {
            str = decodeURIComponent(escape(str))
          } catch (_) {}
          end = JSON.parse(str || '{}')
        } else if (rawEnd && typeof rawEnd === 'object') {
          end = JSON.parse(JSON.stringify(rawEnd))
        }
      } catch (_) {
        end = {}
      }

      // Remover regiao
      if (end && typeof end === 'object') {
        delete end.regiao
      }

      // Pro Natalia: mudar cidade para Campinas
      if (pro.id === 'e1idzk8kslnisju') {
        end.cidade = 'Campinas'
      }

      // Executar UPDATE direto no SQLite via SQL para garantir JSON limpo no banco
      const jsonStr = JSON.stringify(end)
      app
        .db()
        .newQuery('UPDATE users SET endereco_completo = {:ec} WHERE id = {:id}')
        .bind({
          ec: jsonStr,
          id: pro.id,
        })
        .execute()
    }
  },
  (app) => {},
)
