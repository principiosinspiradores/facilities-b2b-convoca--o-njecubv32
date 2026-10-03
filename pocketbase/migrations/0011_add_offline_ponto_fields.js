migrate(
  (app) => {
    const pontos = app.findCollectionByNameOrId('pontos')

    // 1. batido_offline (bool) - flag se foi registrado sem internet
    if (!pontos.fields.getByName('batido_offline')) {
      pontos.fields.add(
        new BoolField({
          name: 'batido_offline',
          required: false,
        }),
      )
    }

    // 2. gps_precisao_m (number) - acurácia em metros capturada pelo GPS
    if (!pontos.fields.getByName('gps_precisao_m')) {
      pontos.fields.add(
        new NumberField({
          name: 'gps_precisao_m',
          required: false,
        }),
      )
    }

    // 3. sincronizado_em (date) - momento exato em que a sincronização subiu para o servidor
    if (!pontos.fields.getByName('sincronizado_em')) {
      pontos.fields.add(
        new DateField({
          name: 'sincronizado_em',
          required: false,
        }),
      )
    }

    // 4. atraso_sincronizacao_minutos (number) - diferença em minutos entre batimento e envio
    if (!pontos.fields.getByName('atraso_sincronizacao_minutos')) {
      pontos.fields.add(
        new NumberField({
          name: 'atraso_sincronizacao_minutos',
          required: false,
        }),
      )
    }

    // 5. horario_suspeito (bool) - batimento offline anterior ao último acesso online conhecido do dispositivo
    if (!pontos.fields.getByName('horario_suspeito')) {
      pontos.fields.add(
        new BoolField({
          name: 'horario_suspeito',
          required: false,
        }),
      )
    }

    // 6. client_uuid (text) - identificador único do registro gerado no cliente para evitar duplicidade no envio
    if (!pontos.fields.getByName('client_uuid')) {
      pontos.fields.add(
        new TextField({
          name: 'client_uuid',
          required: false,
        }),
      )
    }

    app.save(pontos)

    // Adicionar índice em client_uuid e batido_offline
    pontos.addIndex('idx_pontos_client_uuid', false, 'client_uuid', '')
    pontos.addIndex('idx_pontos_offline', false, 'batido_offline', '')
    app.save(pontos)
  },
  (app) => {
    try {
      const pontos = app.findCollectionByNameOrId('pontos')
      pontos.removeIndex('idx_pontos_client_uuid')
      pontos.removeIndex('idx_pontos_offline')

      const fieldsToRemove = [
        'batido_offline',
        'gps_precisao_m',
        'sincronizado_em',
        'atraso_sincronizacao_minutos',
        'horario_suspeito',
        'client_uuid',
      ]
      for (const fName of fieldsToRemove) {
        const f = pontos.fields.getByName(fName)
        if (f) pontos.fields.remove(f)
      }
      app.save(pontos)
    } catch (_) {}
  },
)
