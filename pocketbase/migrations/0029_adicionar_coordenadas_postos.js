migrate(
  (app) => {
    const postos = app.findCollectionByNameOrId('postos')

    if (!postos.fields.getByName('latitude')) {
      postos.fields.add(
        new NumberField({
          name: 'latitude',
          required: false,
        }),
      )
    }

    if (!postos.fields.getByName('longitude')) {
      postos.fields.add(
        new NumberField({
          name: 'longitude',
          required: false,
        }),
      )
    }

    app.save(postos)
  },
  (app) => {
    try {
      const postos = app.findCollectionByNameOrId('postos')
      const campoLat = postos.fields.getByName('latitude')
      if (campoLat) {
        postos.fields.remove(campoLat)
      }
      const campoLng = postos.fields.getByName('longitude')
      if (campoLng) {
        postos.fields.remove(campoLng)
      }
      app.save(postos)
    } catch (_) {}
  },
)
