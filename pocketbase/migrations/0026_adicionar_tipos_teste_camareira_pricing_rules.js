migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pricing_rules')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = [
        'base',
        'treinamento',
        'fim_semana',
        'feriado',
        'negociado',
        'multa_falta',
        'teste',
        'camareira',
      ]
      tipoField.maxSelect = 1
      tipoField.required = true
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pricing_rules')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = [
        'base',
        'treinamento',
        'fim_semana',
        'feriado',
        'negociado',
        'multa_falta',
      ]
      tipoField.maxSelect = 1
      tipoField.required = true
    }
    app.save(col)
  },
)
