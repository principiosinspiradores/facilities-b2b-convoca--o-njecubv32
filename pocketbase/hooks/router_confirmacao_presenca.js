// pocketbase/hooks/router_confirmacao_presenca.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Endpoints de Confirmação de Presença (pré-ponto)
 * 1. POST /backend/v1/facilities/confirmar-presenca/{convocacaoId}
 *    - Gravado pela profissional (ou gestão)
 *    - Marca confirmacao_presenca = 'confirmada' e confirmacao_data = now()
 *
 * 2. POST /backend/v1/facilities/recusar-presenca-hoje/{convocacaoId}
 *    - Disparado pelo botão "Não vou hoje" da profissional
 *    - Marca confirmacao_presenca = 'nao_vai' e confirmacao_data = now()
 *    - A pro NÃO é cancelada, NÃO recebe multa — a convocação aceita dela permanece
 *    - Automaticamente busca TODAS as profissionais elegíveis (usando ElegibilidadeReoferta)
 *    - Cria convocações status='pendente' com regra_aplicada prefixada 'EMERGENCIAL NÃO VOU HOJE — ' + regra do motor
 *    - Push e e-mail disparados automaticamente pelo hook_nova_convocacao
 *    - A própria profissional NÃO recebe nova convocação
 */

// Motor de elegibilidade carregado direto no topo do arquivo (boot garantido).
// Falha aqui não derruba o arquivo: a rota trata a ausência do motor explicitamente.
let elegibilidadeLib = null
try {
  elegibilidadeLib = require(`${__hooks}/lib_elegibilidade_reoferta.js`)
} catch (errLib) {
  console.log(
    '[EMERGENCIAL_NAO_VOU_HOJE] Falha ao carregar lib_elegibilidade_reoferta.js no topo:',
    errLib,
  )
}

// Formatador de data BR (lib_data_br.js), com fallback local dd/mm/aaaa
let formatarDataBRLib = null
try {
  formatarDataBRLib = require(`${__hooks}/lib_data_br.js`).formatarDataBR
} catch (_) {}

function formatarDataEmergencial(dataIso) {
  const raw = (dataIso || '').slice(0, 10)
  if (formatarDataBRLib) {
    try {
      return formatarDataBRLib(raw)
    } catch (_) {}
  }
  const partes = raw.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : raw
}

// Grava push na push_outbox para cada assinatura dos gestores (admin/empresa ativos), mesmo padrão do hook_no_show
function notificarGestoresEmergencial(title, body, tag) {
  let gestores = []
  try {
    gestores = $app.findRecordsByFilter(
      'users',
      "(role = 'empresa' || role = 'admin') && status = 'ativo'",
      '-created',
      20,
      0,
    )
  } catch (errGestores) {
    console.log('[EMERGENCIAL_NAO_VOU_HOJE] Erro ao buscar gestores para push:', errGestores)
    return 0
  }

  let gravados = 0
  for (let g = 0; g < gestores.length; g++) {
    const gestorId = gestores[g].id
    let subs = []
    try {
      subs = $app.findRecordsByFilter(
        'push_subscriptions',
        "user = '" + gestorId + "'",
        '-created',
        10,
        0,
      )
    } catch (_) {}

    for (let s = 0; s < subs.length; s++) {
      try {
        const outboxCol = $app.findCollectionByNameOrId('push_outbox')
        const outboxRec = new Record(outboxCol)
        outboxRec.set('user', gestorId)
        outboxRec.set('endpoint', subs[s].getString('endpoint'))
        outboxRec.set('title', title)
        outboxRec.set('body', body)
        outboxRec.set('url', '/cobertura')
        outboxRec.set('tag', tag)
        outboxRec.set('lido', false)
        $app.save(outboxRec)
        gravados++
      } catch (errOutbox) {
        console.log('[EMERGENCIAL_NAO_VOU_HOJE] Erro ao gravar push_outbox:', errOutbox)
      }
    }
  }
  return gravados
}

routerAdd('POST', '/backend/v1/facilities/confirmar-presenca/{convocacaoId}', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Não autorizado.' })
  }

  const convocacaoId = e.request.pathValue('convocacaoId')
  if (!convocacaoId) {
    return e.json(400, { message: 'ID da convocação obrigatório.' })
  }

  let conv = null
  try {
    conv = $app.findRecordById('convocacoes', convocacaoId)
  } catch (_) {
    return e.json(404, { message: 'Convocação não encontrada.' })
  }

  const proId = conv.getString('pro')
  const userRole = authRecord.getString('role')
  const userId = authRecord.id

  // Apenas a própria pro ou admin/empresa pode confirmar
  if (userRole === 'pro' && userId !== proId) {
    return e.json(403, { message: 'Você só pode confirmar suas próprias escalas.' })
  }

  const nowIso = new Date().toISOString()
  conv.set('confirmacao_presenca', 'confirmada')
  conv.set('confirmacao_data', nowIso)
  $app.save(conv)

  return e.json(200, {
    success: true,
    convocacao_id: conv.id,
    confirmacao_presenca: 'confirmada',
    confirmacao_data: nowIso,
  })
})

routerAdd('POST', '/backend/v1/facilities/recusar-presenca-hoje/{convocacaoId}', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Não autorizado.' })
  }

  const convocacaoId = e.request.pathValue('convocacaoId')
  if (!convocacaoId) {
    return e.json(400, { message: 'ID da convocação obrigatório.' })
  }

  let conv = null
  try {
    conv = $app.findRecordById('convocacoes', convocacaoId)
  } catch (_) {
    return e.json(404, { message: 'Convocação não encontrada.' })
  }

  const proId = conv.getString('pro')
  const userRole = authRecord.getString('role')
  const userId = authRecord.id

  if (userRole === 'pro' && userId !== proId) {
    return e.json(403, { message: 'Você só pode gerenciar suas próprias escalas.' })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  // 1. Gravar na convocação atual 'nao_vai' sem cancelar e sem aplicar multa
  conv.set('confirmacao_presenca', 'nao_vai')
  conv.set('confirmacao_data', nowIso)
  $app.save(conv)

  // 2. Carregar escala e posto
  const escalaId = conv.getString('escala')
  let escala = null
  try {
    escala = $app.findRecordById('escalas', escalaId)
  } catch (_) {}

  if (!escala) {
    return e.json(200, {
      success: true,
      convocacao_id: conv.id,
      confirmacao_presenca: 'nao_vai',
      convocadas: 0,
      message: 'Presença atualizada para não_vai. Escala não encontrada para emergencial.',
    })
  }

  let posto = null
  const postoId = escala.getString('posto')
  if (postoId) {
    try {
      posto = $app.findRecordById('postos', postoId)
    } catch (_) {}
  }

  // 3. Motor ElegibilidadeReoferta: require direto do topo do arquivo; globalThis como fallback secundário
  let elegibilidadeMotor = null
  if (elegibilidadeLib && elegibilidadeLib.buscarProsElegiveisReoferta) {
    elegibilidadeMotor = elegibilidadeLib
  } else if (
    typeof globalThis !== 'undefined' &&
    globalThis.ElegibilidadeReoferta &&
    globalThis.ElegibilidadeReoferta.buscarProsElegiveisReoferta
  ) {
    elegibilidadeMotor = globalThis.ElegibilidadeReoferta
  }

  // Motor indisponível: NÃO cria convocações, mas NÃO falha em silêncio — avisa a gestão e responde com aviso
  if (!elegibilidadeMotor || !elegibilidadeMotor.buscarProsElegiveisReoferta) {
    console.log(
      `[EMERGENCIAL_NAO_VOU_HOJE] ERRO CRÍTICO: Motor ElegibilidadeReoferta indisponível ao processar convocação ${convocacaoId}. Nenhuma convocação emergencial foi gerada. A convocação de origem segue com nao_vai.`,
    )
    const postoFalhaNome = posto ? posto.getString('nome') : 'posto não identificado'
    notificarGestoresEmergencial(
      'Falha no emergencial',
      `Turno de ${postoFalhaNome} em ${formatarDataEmergencial(escala.getString('data'))} ficou sem substituição automática — verificar manualmente`,
      'emergencial-falha-' + conv.id,
    )
    return e.json(200, {
      success: true,
      convocacao_id: conv.id,
      confirmacao_presenca: 'nao_vai',
      convocadas: 0,
      total_convocadas: 0,
      aviso: 'motor_elegibilidade_indisponivel',
      message:
        'Presença atualizada para não_vai. Nenhuma convocação disparada pois o motor de elegibilidade está indisponível.',
    })
  }

  // Buscar profissionais elegíveis via motor com filtros rigorosos; contadores de exclusão para diagnóstico
  const resultadoMotor =
    elegibilidadeMotor.buscarProsElegiveisReoferta({
      escala: escala,
      posto: posto,
      proExcluidoId: proId,
      now: now,
      retornarContadores: true,
    }) || {}
  const elegiveis = Array.isArray(resultadoMotor.pros) ? resultadoMotor.pros : []
  console.log(
    `[EMERGENCIAL_NAO_VOU_HOJE] Contadores de exclusão (convocação ${convocacaoId}): ` +
      JSON.stringify(resultadoMotor.contadores || {}),
  )

  // 4. Criar convocações pendentes com regra_aplicada prefixada 'EMERGENCIAL NÃO VOU HOJE — ' + regra
  const convocacoesCol = $app.findCollectionByNameOrId('convocacoes')
  let totalCriadas = 0
  const criadasIds = []

  const valDiariaBase =
    escala.getFloat('valor_diaria') || (posto ? posto.getFloat('valor_diaria_base') : 0) || 180

  for (let i = 0; i < elegiveis.length; i++) {
    const candidata = elegiveis[i]
    const cId = candidata.id

    // Garantir que a própria pro não receba
    if (cId === proId) continue

    // Determinar valor e regra do motor
    let regraMotor = 'tabela base'
    let valDiaria = valDiariaBase

    if (candidata.getString('status') === 'teste') {
      valDiaria = candidata.getFloat('ajuda_custo') || 50
      regraMotor = 'ajuda de custo (teste)'
    } else if (candidata.getFloat('valor_negociado')) {
      valDiaria = candidata.getFloat('valor_negociado')
      regraMotor = 'valor negociado'
    }

    const regraAplicada = `EMERGENCIAL NÃO VOU HOJE — ${regraMotor}`

    try {
      const novaConv = new Record(convocacoesCol)
      novaConv.set('escala', escalaId)
      novaConv.set('pro', cId)
      novaConv.set('status', 'pendente')
      novaConv.set('valor_diaria', valDiaria)
      novaConv.set('regra_aplicada', regraAplicada)
      novaConv.set('data_convocacao', nowIso)
      novaConv.set('confirmacao_presenca', 'nao_confirmada')
      $app.save(novaConv)

      totalCriadas++
      criadasIds.push(novaConv.id)
    } catch (errCreate) {
      console.log(`[EMERGENCIAL_NAO_VOU_HOJE] Falha ao convocar pro ${cId}:`, errCreate)
    }
  }

  // Nenhuma elegível: não é falha do motor, é zero candidatos — a gestão precisa saber na hora
  if (totalCriadas === 0 && elegiveis.length === 0) {
    const postoSemCobertura = posto ? posto.getString('nome') : 'posto não identificado'
    notificarGestoresEmergencial(
      'Turno sem cobertura',
      `Nenhuma profissional elegível para ${postoSemCobertura}, ${formatarDataEmergencial(escala.getString('data'))} ${escala.getString('turno_inicio')}–${escala.getString('turno_fim')}. Ação manual necessária.`,
      'emergencial-sem-cobertura-' + conv.id,
    )
  }

  // 5. Registrar no histórico da escala
  try {
    const histCol = $app.findCollectionByNameOrId('historico_escalas')
    const hist = new Record(histCol)
    hist.set('escala', escalaId)
    hist.set('usuario', userId)
    hist.set('acao', 'reoferta_emergencial')
    hist.set(
      'descricao',
      `Profissional informou que NÃO VAI HOJE. Convocação emergencial disparada automaticamente para ${totalCriadas} profissional(is) elegível(is).`,
    )
    hist.set(
      'detalhes',
      JSON.stringify({
        convocacao_origem: conv.id,
        pro_origem: proId,
        total_elegiveis: elegiveis.length,
        total_convocadas: totalCriadas,
        convocacoes_criadas: criadasIds,
      }),
    )
    $app.save(hist)
  } catch (errHist) {
    console.log('[EMERGENCIAL_NAO_VOU_HOJE] Erro ao gravar histórico:', errHist)
  }

  return e.json(200, {
    success: true,
    convocacao_id: conv.id,
    confirmacao_presenca: 'nao_vai',
    total_elegiveis: elegiveis.length,
    total_convocadas: totalCriadas,
    convocacoes_criadas: criadasIds,
    message: `Emergencial disparada com sucesso para ${totalCriadas} profissional(is).`,
  })
})
