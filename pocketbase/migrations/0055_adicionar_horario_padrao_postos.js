// 0055: campos aditivos de horário padrão do turno por posto.
// Adiciona apenas turno_inicio_padrao e turno_fim_padrao (texto "HH:MM", opcionais).
// Não altera nem remove nenhum campo ou dado existente.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('postos')
    if (!col.fields.getByName('turno_inicio_padrao')) {
      col.fields.add(new TextField({ name: 'turno_inicio_padrao', max: 5 }))
    }
    if (!col.fields.getByName('turno_fim_padrao')) {
      col.fields.add(new TextField({ name: 'turno_fim_padrao', max: 5 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('postos')
    const f1 = col.fields.getByName('turno_inicio_padrao')
    if (f1) col.fields.removeByName('turno_inicio_padrao')
    const f2 = col.fields.getByName('turno_fim_padrao')
    if (f2) col.fields.removeByName('turno_fim_padrao')
    app.save(col)
  },
)
