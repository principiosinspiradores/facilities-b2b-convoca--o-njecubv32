migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('holidays')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = ['nacional', 'estadual', 'municipal']
      tipoField.maxSelect = 1
      tipoField.required = true
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('holidays')
    const tipoField = col.fields.getByName('tipo')
    if (tipoField) {
      tipoField.values = ['nacional', 'municipal']
      tipoField.maxSelect = 1
      tipoField.required = true
    }
    app.save(col)
  },
)
