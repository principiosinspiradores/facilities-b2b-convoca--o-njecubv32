migrate(
  (app) => {
    // 1. Atualizar coleção users
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['pro', 'empresa', 'admin'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('status')) {
      users.fields.add(
        new SelectField({
          name: 'status',
          values: ['ativo', 'teste', 'suspenso', 'bloqueado'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('documentos')) {
      users.fields.add(
        new JSONField({
          name: 'documentos',
          maxSize: 1048576,
        }),
      )
    }

    if (!users.fields.getByName('periodo_teste_dias')) {
      users.fields.add(
        new NumberField({
          name: 'periodo_teste_dias',
          onlyInt: true,
        }),
      )
    }

    if (!users.fields.getByName('ajuda_custo')) {
      users.fields.add(
        new NumberField({
          name: 'ajuda_custo',
        }),
      )
    }

    if (!users.fields.getByName('valor_negociado')) {
      users.fields.add(
        new NumberField({
          name: 'valor_negociado',
        }),
      )
    }

    if (!users.fields.getByName('bloqueado_ate')) {
      users.fields.add(
        new DateField({
          name: 'bloqueado_ate',
        }),
      )
    }

    // Regras de acesso em users: pros veem/editam a si mesmos; admin/empresa full
    users.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.id = id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.id = id)"
    users.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.id = id)"
    users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"

    users.addIndex('idx_users_role_status', false, 'role, status', '')
    app.save(users)

    const usersId = users.id

    // 2. Coleção postos
    const postos = new Collection({
      name: 'postos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'nome', type: 'text', required: true },
        {
          name: 'funcao',
          type: 'select',
          values: ['porteiro', 'limpeza', 'zeladoria', 'outro'],
          maxSelect: 1,
          required: true,
        },
        { name: 'endereco', type: 'json' },
        { name: 'carga_horaria', type: 'number', required: true },
        { name: 'vigencia_inicio', type: 'date' },
        { name: 'vigencia_fim', type: 'date' },
        { name: 'requisitos', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'inativo'],
          maxSelect: 1,
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_postos_status ON postos (status)',
        'CREATE INDEX idx_postos_funcao ON postos (funcao)',
      ],
    })
    app.save(postos)
    const postosId = postos.id

    // 3. Coleção escalas
    const escalas = new Collection({
      name: 'escalas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.role = 'pro')",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      fields: [
        {
          name: 'posto',
          type: 'relation',
          collectionId: postosId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        { name: 'data', type: 'date', required: true },
        { name: 'turno_inicio', type: 'text', required: true },
        { name: 'turno_fim', type: 'text', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['aberta', 'convocada', 'aceita', 'coberta', 'falta', 'cancelada', 'concluida'],
          maxSelect: 1,
          required: true,
        },
        { name: 'multa_aplicada', type: 'bool' },
        { name: 'valor_diaria', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_escalas_posto ON escalas (posto)',
        'CREATE INDEX idx_escalas_data ON escalas (data)',
        'CREATE INDEX idx_escalas_status ON escalas (status)',
      ],
    })
    app.save(escalas)
    const escalasId = escalas.id

    // 4. Coleção convocacoes
    const convocacoes = new Collection({
      name: 'convocacoes',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'escala',
          type: 'relation',
          collectionId: escalasId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'pro',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'status',
          type: 'select',
          values: ['pendente', 'aceita', 'recusada', 'cancelada', 'coberta', 'falta'],
          maxSelect: 1,
          required: true,
        },
        { name: 'valor_diaria', type: 'number' },
        { name: 'regra_aplicada', type: 'text' },
        { name: 'data_convocacao', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_convocacoes_escala ON convocacoes (escala)',
        'CREATE INDEX idx_convocacoes_pro ON convocacoes (pro)',
        'CREATE INDEX idx_convocacoes_status ON convocacoes (status)',
      ],
    })
    app.save(convocacoes)

    // 5. Coleção pricing_rules
    const pricingRules = new Collection({
      name: 'pricing_rules',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'tipo',
          type: 'select',
          values: ['base', 'treinamento', 'fim_semana', 'feriado', 'negociado', 'multa_falta'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'posto',
          type: 'relation',
          collectionId: postosId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'faixa_horas', type: 'number' },
        { name: 'valor', type: 'number', required: true },
        { name: 'dias', type: 'number' },
        { name: 'vigencia_inicio', type: 'date' },
        { name: 'vigencia_fim', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pricing_rules_tipo ON pricing_rules (tipo)',
        'CREATE INDEX idx_pricing_rules_posto ON pricing_rules (posto)',
      ],
    })
    app.save(pricingRules)

    // 6. Coleção holidays
    const holidays = new Collection({
      name: 'holidays',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'data', type: 'date', required: true },
        { name: 'nome', type: 'text', required: true },
        {
          name: 'tipo',
          type: 'select',
          values: ['nacional', 'municipal'],
          maxSelect: 1,
          required: true,
        },
        { name: 'cidade', type: 'text' },
        { name: 'uf', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_holidays_data ON holidays (data)',
        'CREATE INDEX idx_holidays_tipo ON holidays (tipo)',
      ],
    })
    app.save(holidays)

    // 7. Coleção payouts
    const payouts = new Collection({
      name: 'payouts',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.role = 'pro')",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'escala',
          type: 'relation',
          collectionId: escalasId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'pro',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        { name: 'valor', type: 'number', required: true },
        {
          name: 'status',
          type: 'select',
          values: ['retido', 'pago', 'disputa', 'cancelado'],
          maxSelect: 1,
          required: true,
        },
        { name: 'disputa_aberta', type: 'bool' },
        { name: 'data_conclusao', type: 'date' },
        { name: 'data_liberacao', type: 'date' },
        { name: 'provedor', type: 'text' },
        { name: 'referencia', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_payouts_status ON payouts (status)',
        'CREATE INDEX idx_payouts_pro ON payouts (pro)',
        'CREATE INDEX idx_payouts_liberacao ON payouts (data_liberacao)',
      ],
    })
    app.save(payouts)
    const payoutsId = payouts.id

    // 8. Coleção payment_events
    const paymentEvents = new Collection({
      name: 'payment_events',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'payout',
          type: 'relation',
          collectionId: payoutsId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'tipo', type: 'text', required: true },
        { name: 'valor', type: 'number' },
        { name: 'metadata', type: 'json' },
        { name: 'data', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_payment_events_tipo ON payment_events (tipo)',
        'CREATE INDEX idx_payment_events_payout ON payment_events (payout)',
      ],
    })
    app.save(paymentEvents)

    // 9. Coleção disputas
    const disputas = new Collection({
      name: 'disputas',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (pro = @request.auth.id || @request.auth.role = 'admin')",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'payout',
          type: 'relation',
          collectionId: payoutsId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'pro',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        { name: 'motivo', type: 'text', required: true },
        {
          name: 'resolucao',
          type: 'select',
          values: ['pendente', 'a_favor_pro', 'a_favor_empresa'],
          maxSelect: 1,
          required: true,
        },
        { name: 'data_abertura', type: 'date', required: true },
        { name: 'data_resolucao', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_disputas_resolucao ON disputas (resolucao)',
        'CREATE INDEX idx_disputas_pro ON disputas (pro)',
      ],
    })
    app.save(disputas)

    // 10. Coleção settings
    const settings = new Collection({
      name: 'settings',
      type: 'base',
      listRule: '', // leitura pública para carregar nome/logo/cores no layout e login
      viewRule: '',
      createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        { name: 'nome_empresa', type: 'text', required: true },
        {
          name: 'logo',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
        },
        { name: 'cor_primaria', type: 'text', required: true },
        { name: 'cor_secundaria', type: 'text', required: true },
        { name: 'guarantee_period_days', type: 'number', required: true },
        { name: 'dispute_period_hours', type: 'number', required: true },
        {
          name: 'payout_provider',
          type: 'select',
          values: ['mercadopago', 'pix_manual', 'outro'],
          maxSelect: 1,
          required: true,
        },
        { name: 'multa_falta_pro', type: 'number', required: true },
        { name: 'multa_empresa_cancelamento', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(settings)

    // 11. Coleção conta_pix
    const contaPix = new Collection({
      name: 'conta_pix',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (pro = @request.auth.id || @request.auth.role = 'admin')",
      updateRule:
        "@request.auth.id != '' && (pro = @request.auth.id || @request.auth.role = 'admin')",
      deleteRule:
        "@request.auth.id != '' && (pro = @request.auth.id || @request.auth.role = 'admin')",
      fields: [
        {
          name: 'pro',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'tipo_chave',
          type: 'select',
          values: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'],
          maxSelect: 1,
          required: true,
        },
        { name: 'chave', type: 'text', required: true },
        { name: 'provedor_conta', type: 'text' },
        { name: 'conta_referencia', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_conta_pix_pro ON conta_pix (pro)'],
    })
    app.save(contaPix)
  },
  (app) => {
    const toDelete = [
      'conta_pix',
      'settings',
      'disputas',
      'payment_events',
      'payouts',
      'holidays',
      'pricing_rules',
      'convocacoes',
      'escalas',
      'postos',
    ]
    for (const name of toDelete) {
      try {
        const col = app.findCollectionByNameOrId(name)
        app.delete(col)
      } catch (_) {}
    }
  },
)
