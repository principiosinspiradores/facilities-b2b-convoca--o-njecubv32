migrate(
  (app) => {
    // 1. Adicionar campo valor_diaria_base em 'postos' (number, min 0, opcional)
    const postos = app.findCollectionByNameOrId('postos')
    if (!postos.fields.getByName('valor_diaria_base')) {
      postos.fields.add(
        new NumberField({
          name: 'valor_diaria_base',
          min: 0,
          required: false,
        }),
      )
      app.save(postos)
    }
  },
  (app) => {
    try {
      const postos = app.findCollectionByNameOrId('postos')
      const campo = postos.fields.getByName('valor_diaria_base')
      if (campo) {
        postos.fields.remove(campo)
        app.save(postos)
      }
    } catch (_) {}
  },
)
