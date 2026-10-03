// pocketbase/hooks/router_calcular_diaria.js
routerAdd('GET', '/backend/v1/calcular-diaria/{escalaId}/{proId}', (e) => {
  const escalaId = e.request.pathValue('escalaId')
  const proId = e.request.pathValue('proId')

  let escala
  try {
    escala = $app.findRecordById('escalas', escalaId)
  } catch (_) {
    return e.json(404, { error: 'Escala não encontrada' })
  }

  let posto
  try {
    posto = $app.findRecordById('postos', escala.getString('posto'))
  } catch (_) {
    return e.json(404, { error: 'Posto associado não encontrado' })
  }

  let pro
  try {
    pro = $app.findRecordById('users', proId)
  } catch (_) {
    return e.json(404, { error: 'Profissional não encontrado' })
  }

  const cargaHoraria = posto.getInt('carga_horaria') || 8

  // REGRA ESPECIAL: PROFISSIONAL FIXA POR POSTO
  // A profissional fixa NÃO usa o motor de diária. O valor dela é diferente:
  // Fixo mensal (contratada) -> valor 0 na diária (ou contratado mensal) e não entra em escrow diário
  // Por hora trabalhada -> cargaHoraria * valor da hora
  const proFixoId = posto.getString('pro_fixo')
  if (proFixoId && proFixoId === proId) {
    const tipoRemun = posto.getString('tipo_remuneracao_fixa') || 'mensal'
    const valorRemun = posto.getFloat('valor_remuneracao_fixa') || 0

    if (tipoRemun === 'mensal') {
      return e.json(200, {
        valor: 0,
        valor_mensal: valorRemun,
        tipo_remuneracao: 'mensal',
        is_fixa: true,
        regra_aplicada:
          'profissional fixa (mensalista contratada: R$ ' + valorRemun.toFixed(2) + '/mês)',
      })
    } else {
      // por_hora
      const valorTotalTurno = cargaHoraria * valorRemun
      return e.json(200, {
        valor: valorTotalTurno,
        valor_hora: valorRemun,
        tipo_remuneracao: 'por_hora',
        is_fixa: true,
        regra_aplicada:
          'profissional fixa (R$ ' +
          valorRemun.toFixed(2) +
          '/h × ' +
          cargaHoraria +
          'h = R$ ' +
          valorTotalTurno.toFixed(2) +
          ')',
      })
    }
  }

  // FREELANCERS SEGUEM O MOTOR DE 3 CAMADAS
  const escalaData =
    (escala.getString('data') || '').split('T')[0] || (escala.getString('data') || '').slice(0, 10)

  // Parse dia da semana (0 domingo, 6 sábado)
  // Criar data com timezone neutro para evitar offset
  const parts = escalaData.split('-')
  const dt = new Date(
    Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)),
  )
  const dayOfWeek = dt.getUTCDay() // 0 = Dom, 6 = Sáb
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  // 1. Tabela base
  let valorBase = 180
  let captionBase = 'tabela base (' + cargaHoraria + 'h)'

  try {
    const baseRules = $app.findRecordsByFilter(
      'pricing_rules',
      "tipo = 'base'",
      'faixa_horas',
      50,
      0,
    )
    if (baseRules && baseRules.length > 0) {
      // Procura faixa exata
      let exact = null
      let lower = null
      let maxRule = baseRules[0]

      for (let i = 0; i < baseRules.length; i++) {
        const r = baseRules[i]
        const h = r.getInt('faixa_horas')
        if (h === cargaHoraria) {
          exact = r
          break
        }
        if (h < cargaHoraria && (!lower || h > lower.getInt('faixa_horas'))) {
          lower = r
        }
        if (h > maxRule.getInt('faixa_horas')) {
          maxRule = r
        }
      }

      const chosen = exact || lower || maxRule
      if (chosen) {
        valorBase = chosen.getFloat('valor')
        captionBase = 'tabela base (' + chosen.getInt('faixa_horas') + 'h)'
      }
    }
  } catch (_) {}

  // 2. Exceções por posto
  let valorExcecao = null
  let captionExcecao = null

  // 2a. Treinamento
  try {
    const treinoRules = $app.findRecordsByFilter(
      'pricing_rules',
      "tipo = 'treinamento' && posto = '" + posto.id + "'",
      '-created',
      10,
      0,
    )

    if (treinoRules && treinoRules.length > 0) {
      for (let i = 0; i < treinoRules.length; i++) {
        const tr = treinoRules[i]
        const startStr = (tr.getString('vigencia_inicio') || '').slice(0, 10)
        const dias = tr.getInt('dias') || 10
        if (startStr) {
          const sp = startStr.split('-')
          const startDate = new Date(
            Date.UTC(parseInt(sp[0], 10), parseInt(sp[1], 10) - 1, parseInt(sp[2], 10)),
          )
          const diffMs = dt.getTime() - startDate.getTime()
          const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))

          if (diffDias >= 0 && diffDias < dias) {
            const restam = dias - diffDias
            valorExcecao = tr.getFloat('valor')
            captionExcecao = 'treinamento, restam ' + restam + (restam === 1 ? ' dia' : ' dias')
            break
          }
        }
      }
    }
  } catch (_) {}

  // 2b. Fim de semana (se não foi treinamento)
  if (!valorExcecao && isWeekend) {
    try {
      const fdsRules = $app.findRecordsByFilter(
        'pricing_rules',
        "tipo = 'fim_semana' && posto = '" + posto.id + "'",
        '-created',
        1,
        0,
      )
      if (fdsRules && fdsRules.length > 0) {
        valorExcecao = fdsRules[0].getFloat('valor')
        captionExcecao = 'fim de semana'
      }
    } catch (_) {}
  }

  // 2c. Feriado (se não foi treinamento ou fds)
  if (!valorExcecao) {
    try {
      // Buscar feriados na data
      let endPosto = {}
      try {
        const rawEnd = posto.get('endereco')
        if (typeof rawEnd === 'string' && rawEnd.trim()) {
          endPosto = JSON.parse(rawEnd)
        } else if (rawEnd && typeof rawEnd === 'object') {
          endPosto = rawEnd
        }
      } catch (_) {}

      const cidadePosto = (endPosto.cidade || '').trim()
      const ufPosto = (endPosto.uf || '').trim()

      const holidays = $app.findRecordsByFilter(
        'holidays',
        "data ~ '" + escalaData + "'",
        '-created',
        20,
        0,
      )

      let isHoliday = false
      let holidayName = ''

      for (let i = 0; i < holidays.length; i++) {
        const h = holidays[i]
        const hTipo = h.getString('tipo')
        if (hTipo === 'nacional') {
          isHoliday = true
          holidayName = h.getString('nome')
          break
        } else if (hTipo === 'estadual') {
          const hUf = (h.getString('uf') || '').trim()
          if (hUf && ufPosto && hUf.toUpperCase() === ufPosto.toUpperCase()) {
            isHoliday = true
            holidayName = h.getString('nome')
            break
          }
        } else if (hTipo === 'municipal') {
          const hCidade = (h.getString('cidade') || '').trim()
          const hUf = (h.getString('uf') || '').trim()
          if (
            hCidade &&
            cidadePosto &&
            hCidade.toLowerCase() === cidadePosto.toLowerCase() &&
            (!hUf || !ufPosto || hUf.toUpperCase() === ufPosto.toUpperCase())
          ) {
            isHoliday = true
            holidayName = h.getString('nome')
            break
          }
        }
      }

      if (isHoliday) {
        // Tentar regra de feriado no posto
        const feriadoRules = $app.findRecordsByFilter(
          'pricing_rules',
          "tipo = 'feriado' && posto = '" + posto.id + "'",
          '-created',
          1,
          0,
        )
        if (feriadoRules && feriadoRules.length > 0) {
          valorExcecao = feriadoRules[0].getFloat('valor')
        } else {
          // Se não há regra específica, adiciona adicional de feriado ou mantém base
          valorExcecao = valorBase
        }
        captionExcecao = 'feriado (' + holidayName + ')'
      }
    } catch (_) {}
  }

  let valorFinal = valorExcecao !== null ? valorExcecao : valorBase
  let regraFinal = captionExcecao !== null ? captionExcecao : captionBase

  // 3. Camada Pro: Período de teste vs Valor Negociado
  const proStatus = pro.getString('status')
  const ajudaCusto = pro.getFloat('ajuda_custo') || 50
  const valorNegociado = pro.getFloat('valor_negociado')

  if (proStatus === 'teste') {
    // Pro em período de teste recebe ajuda de custo fixa
    valorFinal = ajudaCusto
    regraFinal = 'ajuda de custo (teste)'
  } else if (valorNegociado && valorNegociado > 0) {
    // Pro ativo/outro com valor negociado sobrepõe camadas 1 e 2
    valorFinal = valorNegociado
    regraFinal = 'valor negociado'
  }

  return e.json(200, {
    valor: valorFinal,
    regra_aplicada: regraFinal,
    is_fixa: false,
  })
})
