migrate(
  (app) => {
    // 1. Atualizar campos da coleção settings
    const settings = app.findCollectionByNameOrId('settings')

    // multa_cancelamento_pro (R$ ou valor de penalidade por cancelamento do pro após aceitar)
    if (!settings.fields.getByName('multa_cancelamento_pro')) {
      settings.fields.add(
        new NumberField({
          name: 'multa_cancelamento_pro',
        }),
      )
    }

    // carencia_cancelamento_empresa (horas ou minutos de antecedência mínima para a empresa cancelar sem penalidade)
    if (!settings.fields.getByName('carencia_cancelamento_empresa')) {
      settings.fields.add(
        new NumberField({
          name: 'carencia_cancelamento_empresa',
          onlyInt: true,
        }),
      )
    }

    // horas_bloqueio_cancelamento (ex: 24h)
    if (!settings.fields.getByName('horas_bloqueio_cancelamento')) {
      settings.fields.add(
        new NumberField({
          name: 'horas_bloqueio_cancelamento',
          onlyInt: true,
        }),
      )
    }

    // limite_reincidencia_suspensao (ex: 2 cancelamentos acumulados para suspensão)
    if (!settings.fields.getByName('limite_reincidencia_suspensao')) {
      settings.fields.add(
        new NumberField({
          name: 'limite_reincidencia_suspensao',
          onlyInt: true,
        }),
      )
    }

    // Informações da conta de pagamento da empresa
    if (!settings.fields.getByName('empresa_pix_chave')) {
      settings.fields.add(
        new TextField({
          name: 'empresa_pix_chave',
        }),
      )
    }

    if (!settings.fields.getByName('empresa_pix_tipo')) {
      settings.fields.add(
        new TextField({
          name: 'empresa_pix_tipo',
        }),
      )
    }

    if (!settings.fields.getByName('empresa_titular')) {
      settings.fields.add(
        new TextField({
          name: 'empresa_titular',
        }),
      )
    }

    if (!settings.fields.getByName('empresa_mp_client_id')) {
      settings.fields.add(
        new TextField({
          name: 'empresa_mp_client_id',
        }),
      )
    }

    app.save(settings)

    // Atualizar registro existente de settings com valores default coerentes
    try {
      const records = app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (records && records.length > 0) {
        const s = records[0]
        if (s.getFloat('multa_cancelamento_pro') === 0) s.set('multa_cancelamento_pro', 30)
        if (s.getInt('carencia_cancelamento_empresa') === 0)
          s.set('carencia_cancelamento_empresa', 12)
        if (s.getInt('horas_bloqueio_cancelamento') === 0) s.set('horas_bloqueio_cancelamento', 24)
        if (s.getInt('limite_reincidencia_suspensao') === 0)
          s.set('limite_reincidencia_suspensao', 2)
        if (!s.getString('empresa_pix_chave'))
          s.set('empresa_pix_chave', 'financeiro@facilitiespro.com.br')
        if (!s.getString('empresa_pix_tipo')) s.set('empresa_pix_tipo', 'email')
        if (!s.getString('empresa_titular'))
          s.set('empresa_titular', 'Facilities Pro Pagamentos Ltda')
        app.save(s)
      }
    } catch (_) {}

    // 2. Atualizar coleção conta_pix com campo 'liberada' (bool)
    const contaPix = app.findCollectionByNameOrId('conta_pix')
    if (!contaPix.fields.getByName('liberada')) {
      contaPix.fields.add(
        new BoolField({
          name: 'liberada',
        }),
      )
    }

    if (!contaPix.fields.getByName('data_liberacao')) {
      contaPix.fields.add(
        new DateField({
          name: 'data_liberacao',
        }),
      )
    }

    if (!contaPix.fields.getByName('observacao_validacao')) {
      contaPix.fields.add(
        new TextField({
          name: 'observacao_validacao',
        }),
      )
    }

    app.save(contaPix)

    // Atualizar a conta pix existente do pro Ativo para liberada=true
    try {
      const contas = app.findRecordsByFilter('conta_pix', 'id != ""', '-created', 10, 0)
      for (let i = 0; i < contas.length; i++) {
        const c = contas[i]
        c.set('liberada', true)
        c.set('data_liberacao', new Date().toISOString())
        c.set('observacao_validacao', 'Conta inicial validada pelo administrador.')
        app.save(c)
      }
    } catch (_) {}
  },
  (app) => {
    // Reverter campos se necessário
  },
)
