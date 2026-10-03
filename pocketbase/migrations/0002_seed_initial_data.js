migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    // Helper para buscar ou criar usuário auth
    function getOrCreateUser(email, password, name, role, status, extra = {}) {
      try {
        const existing = app.findAuthRecordByEmail('_pb_users_auth_', email)
        return existing
      } catch (_) {
        const rec = new Record(usersCol)
        rec.setEmail(email)
        rec.setPassword(password)
        rec.setVerified(true)
        rec.set('name', name)
        rec.set('role', role)
        rec.set('status', status)
        if (extra.documentos) rec.set('documentos', extra.documentos)
        if (extra.periodo_teste_dias !== undefined)
          rec.set('periodo_teste_dias', extra.periodo_teste_dias)
        if (extra.ajuda_custo !== undefined) rec.set('ajuda_custo', extra.ajuda_custo)
        if (extra.valor_negociado !== undefined) rec.set('valor_negociado', extra.valor_negociado)
        if (extra.bloqueado_ate) rec.set('bloqueado_ate', extra.bloqueado_ate)
        app.save(rec)
        return rec
      }
    }

    // 1. Admin
    const admin = getOrCreateUser(
      'janluyfranca@gmail.com',
      'Skip@Pass',
      'Janluy França (Admin)',
      'admin',
      'ativo',
      {
        periodo_teste_dias: 10,
        ajuda_custo: 50,
      },
    )

    // 1.1 Empresa Facilities
    const empresa = getOrCreateUser(
      'empresa@facilitiespro.com.br',
      'Skip@Pass',
      'Alpha Facilities Ltda',
      'empresa',
      'ativo',
      {
        periodo_teste_dias: 10,
        ajuda_custo: 50,
      },
    )

    // 2. Pros de exemplo
    // Pro 1: Ativo, documentos verificados
    const proAtivo = getOrCreateUser(
      'carlos.silva@pro.com.br',
      'Skip@Pass',
      'Carlos Silva',
      'pro',
      'ativo',
      {
        periodo_teste_dias: 10,
        ajuda_custo: 50,
        valor_negociado: 190,
        documentos: [
          { tipo: 'RG/CPF', status: 'verificado', arquivo_url: '' },
          { tipo: 'Comprovante Residência', status: 'verificado', arquivo_url: '' },
          { tipo: 'Certidão Antecedentes', status: 'verificado', arquivo_url: '' },
        ],
      },
    )

    // Pro 2: Teste (dentro do período de teste)
    const proTeste = getOrCreateUser(
      'marcos.teste@pro.com.br',
      'Skip@Pass',
      'Marcos Teste Santos',
      'pro',
      'teste',
      {
        periodo_teste_dias: 10,
        ajuda_custo: 50,
        documentos: [
          { tipo: 'RG/CPF', status: 'verificado', arquivo_url: '' },
          { tipo: 'Comprovante Residência', status: 'pendente', arquivo_url: '' },
        ],
      },
    )

    // Pro 3: Suspenso
    const proSuspenso = getOrCreateUser(
      'roberto.suspenso@pro.com.br',
      'Skip@Pass',
      'Roberto Lima',
      'pro',
      'suspenso',
      {
        periodo_teste_dias: 10,
        ajuda_custo: 50,
        documentos: [{ tipo: 'RG/CPF', status: 'rejeitado', arquivo_url: '' }],
      },
    )

    // 3. Settings (Singleton)
    const settingsCol = app.findCollectionByNameOrId('settings')
    try {
      app.findFirstRecordByData('settings', 'nome_empresa', 'Facilities Pro')
    } catch (_) {
      const s = new Record(settingsCol)
      s.set('nome_empresa', 'Facilities Pro')
      s.set('cor_primaria', '#0F766E')
      s.set('cor_secundaria', '#134E4A')
      s.set('guarantee_period_days', 7)
      s.set('dispute_period_hours', 24)
      s.set('payout_provider', 'mercadopago')
      s.set('multa_falta_pro', 50)
      s.set('multa_empresa_cancelamento', 1)
      app.save(s)
    }

    // 4. Postos de exemplo (na mesma cidade: São Paulo - SP)
    const postosCol = app.findCollectionByNameOrId('postos')
    let postoTorre, postoGalpao

    try {
      postoTorre = app.findFirstRecordByData('postos', 'nome', 'Portaria Torre Alfa')
    } catch (_) {
      postoTorre = new Record(postosCol)
      postoTorre.set('nome', 'Portaria Torre Alfa')
      postoTorre.set('funcao', 'porteiro')
      postoTorre.set('carga_horaria', 8)
      postoTorre.set('status', 'ativo')
      postoTorre.set('vigencia_inicio', '2025-01-01')
      postoTorre.set('vigencia_fim', '2026-12-31')
      postoTorre.set('requisitos', 'Controle de acesso predial, CFTV e boa comunicação.')
      postoTorre.set('endereco', {
        logradouro: 'Av. Paulista',
        numero: '1000',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01310-100',
      })
      app.save(postoTorre)
    }

    try {
      postoGalpao = app.findFirstRecordByData('postos', 'nome', 'Limpeza Galpão Beta')
    } catch (_) {
      postoGalpao = new Record(postosCol)
      postoGalpao.set('nome', 'Limpeza Galpão Beta')
      postoGalpao.set('funcao', 'limpeza')
      postoGalpao.set('carga_horaria', 6)
      postoGalpao.set('status', 'ativo')
      postoGalpao.set('vigencia_inicio', '2025-01-01')
      postoGalpao.set('vigencia_fim', '2026-12-31')
      postoGalpao.set(
        'requisitos',
        'Limpeza industrial, manuseio de lavadora de piso e desinfecção.',
      )
      postoGalpao.set('endereco', {
        logradouro: 'Rua do Gasômetro',
        numero: '500',
        bairro: 'Brás',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '03004-000',
      })
      app.save(postoGalpao)
    }

    // 5. Pricing Rules
    const pricingCol = app.findCollectionByNameOrId('pricing_rules')

    // Base 4h = 130
    try {
      app.findFirstRecordByData('pricing_rules', 'faixa_horas', 4)
    } catch (_) {
      const r4 = new Record(pricingCol)
      r4.set('tipo', 'base')
      r4.set('faixa_horas', 4)
      r4.set('valor', 130)
      app.save(r4)
    }

    // Base 6h = 160
    try {
      app.findFirstRecordByData('pricing_rules', 'faixa_horas', 6)
    } catch (_) {
      const r6 = new Record(pricingCol)
      r6.set('tipo', 'base')
      r6.set('faixa_horas', 6)
      r6.set('valor', 160)
      app.save(r6)
    }

    // Base 8h = 180
    try {
      app.findFirstRecordByData('pricing_rules', 'faixa_horas', 8)
    } catch (_) {
      const r8 = new Record(pricingCol)
      r8.set('tipo', 'base')
      r8.set('faixa_horas', 8)
      r8.set('valor', 180)
      app.save(r8)
    }

    // Exceção de treinamento no Posto Torre Alfa (R$ 130 por 10 dias)
    try {
      app.findFirstRecordByData('pricing_rules', 'posto', postoTorre.id)
    } catch (_) {
      const rTreino = new Record(pricingCol)
      rTreino.set('tipo', 'treinamento')
      rTreino.set('posto', postoTorre.id)
      rTreino.set('valor', 130)
      rTreino.set('dias', 10)
      rTreino.set('vigencia_inicio', '2025-01-01')
      rTreino.set('vigencia_fim', '2025-12-31')
      app.save(rTreino)
    }

    // Exceção de fim de semana no Posto Galpão Beta (R$ 150)
    try {
      app.findFirstRecordByData('pricing_rules', 'posto', postoGalpao.id)
    } catch (_) {
      const rFds = new Record(pricingCol)
      rFds.set('tipo', 'fim_semana')
      rFds.set('posto', postoGalpao.id)
      rFds.set('valor', 150)
      rFds.set('vigencia_inicio', '2025-01-01')
      rFds.set('vigencia_fim', '2025-12-31')
      app.save(rFds)
    }

    // 6. Holidays (Nacionais e Municipal de São Paulo)
    const holidaysCol = app.findCollectionByNameOrId('holidays')
    const sampleHolidays = [
      { data: '2025-01-01', nome: 'Ano Novo', tipo: 'nacional' },
      {
        data: '2025-01-25',
        nome: 'Aniversário de São Paulo',
        tipo: 'municipal',
        cidade: 'São Paulo',
        uf: 'SP',
      },
      { data: '2025-04-21', nome: 'Tiradentes', tipo: 'nacional' },
      { data: '2025-05-01', nome: 'Dia do Trabalho', tipo: 'nacional' },
      { data: '2025-09-07', nome: 'Independência do Brasil', tipo: 'nacional' },
      { data: '2025-11-20', nome: 'Consciência Negra', tipo: 'nacional' },
      { data: '2025-12-25', nome: 'Natal', tipo: 'nacional' },
    ]

    for (const h of sampleHolidays) {
      try {
        app.findFirstRecordByData('holidays', 'nome', h.nome)
      } catch (_) {
        const recH = new Record(holidaysCol)
        recH.set('data', h.data)
        recH.set('nome', h.nome)
        recH.set('tipo', h.tipo)
        if (h.cidade) recH.set('cidade', h.cidade)
        if (h.uf) recH.set('uf', h.uf)
        app.save(recH)
      }
    }

    // 7. Conta Pix para o Pro Ativo
    const contaPixCol = app.findCollectionByNameOrId('conta_pix')
    try {
      app.findFirstRecordByData('conta_pix', 'pro', proAtivo.id)
    } catch (_) {
      const pix = new Record(contaPixCol)
      pix.set('pro', proAtivo.id)
      pix.set('tipo_chave', 'cpf')
      pix.set('chave', '123.456.789-00')
      pix.set('provedor_conta', 'mercadopago')
      pix.set('conta_referencia', 'carlos.silva@pro.com.br')
      app.save(pix)
    }

    // 8. Escalas e Convocações de exemplo (para o Pro Ativo ver convocações imediatamente)
    const escalasCol = app.findCollectionByNameOrId('escalas')
    const convocacoesCol = app.findCollectionByNameOrId('convocacoes')

    // Escala 1 (Amanhã - Posto Torre Alfa 8h)
    let esc1
    try {
      esc1 = app.findFirstRecordByData('escalas', 'turno_inicio', '07:00')
    } catch (_) {
      esc1 = new Record(escalasCol)
      esc1.set('posto', postoTorre.id)
      esc1.set('data', '2025-06-10')
      esc1.set('turno_inicio', '07:00')
      esc1.set('turno_fim', '15:00')
      esc1.set('status', 'convocada')
      esc1.set('multa_aplicada', false)
      esc1.set('valor_diaria', 180)
      app.save(esc1)

      const conv1 = new Record(convocacoesCol)
      conv1.set('escala', esc1.id)
      conv1.set('pro', proAtivo.id)
      conv1.set('status', 'pendente')
      conv1.set('valor_diaria', 180)
      conv1.set('regra_aplicada', 'tabela base (8h)')
      conv1.set('data_convocacao', '2025-06-08')
      app.save(conv1)
    }

    // Escala 2 (Fim de Semana - Posto Galpão Beta 6h)
    let esc2
    try {
      esc2 = app.findFirstRecordByData('escalas', 'turno_inicio', '08:00')
    } catch (_) {
      esc2 = new Record(escalasCol)
      esc2.set('posto', postoGalpao.id)
      esc2.set('data', '2025-06-14')
      esc2.set('turno_inicio', '08:00')
      esc2.set('turno_fim', '14:00')
      esc2.set('status', 'convocada')
      esc2.set('multa_aplicada', false)
      esc2.set('valor_diaria', 150)
      app.save(esc2)

      const conv2 = new Record(convocacoesCol)
      conv2.set('escala', esc2.id)
      conv2.set('pro', proAtivo.id)
      conv2.set('status', 'pendente')
      conv2.set('valor_diaria', 150)
      conv2.set('regra_aplicada', 'fim de semana')
      conv2.set('data_convocacao', '2025-06-08')
      app.save(conv2)
    }

    // Escala 3 (Já aceita pelo Pro Ativo com payout retido de exemplo)
    const payoutsCol = app.findCollectionByNameOrId('payouts')
    let esc3
    try {
      esc3 = app.findFirstRecordByData('escalas', 'turno_inicio', '14:00')
    } catch (_) {
      esc3 = new Record(escalasCol)
      esc3.set('posto', postoTorre.id)
      esc3.set('data', '2025-06-05')
      esc3.set('turno_inicio', '14:00')
      esc3.set('turno_fim', '22:00')
      esc3.set('status', 'aceita')
      esc3.set('multa_aplicada', false)
      esc3.set('valor_diaria', 180)
      app.save(esc3)

      const conv3 = new Record(convocacoesCol)
      conv3.set('escala', esc3.id)
      conv3.set('pro', proAtivo.id)
      conv3.set('status', 'aceita')
      conv3.set('valor_diaria', 180)
      conv3.set('regra_aplicada', 'tabela base (8h)')
      conv3.set('data_convocacao', '2025-06-02')
      app.save(conv3)

      const pay3 = new Record(payoutsCol)
      pay3.set('escala', esc3.id)
      pay3.set('pro', proAtivo.id)
      pay3.set('valor', 180)
      pay3.set('status', 'retido')
      pay3.set('disputa_aberta', false)
      pay3.set('data_conclusao', '2025-06-05')
      pay3.set('data_liberacao', '2025-06-12')
      pay3.set('provedor', 'mercadopago')
      pay3.set('referencia', 'MP-ESC-001')
      app.save(pay3)
    }
  },
  (app) => {
    // down migration
  },
)
