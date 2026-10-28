// pocketbase/hooks/lib_elegibilidade_reoferta.js
// Helper compartilhado para filtros de elegibilidade na reoferta automática (no-show e cancelamento/recusa).
// Regras:
// 1. Normalização sem acento / caixa baixa para comparação de strings.
// 2. Extração robusta de users.funcoes (JSON, array, string ou buffer goja).
// 3. Filtro de Função: o pro deve possuir a função do posto (postos.funcao). Pro sem funções cadastradas NÃO é elegível.
// 4. Filtro de Disponibilidade Real na mesma data:
//    (a) Sem convocação status='aceita' em QUALQUER posto com turno sobreposto (iniA < fimB && iniB < fimA).
//    (b) Sem registro de ponto de 'chegada' (coleção pontos) naquele dia (timestamp_real ou created).
//    (c) Sem convocação status='pendente' em qualquer escala do mesmo dia.
//    (d) Exclusões padrão: bloqueado_ate > now, já convocada na escala destino, e a própria pro excluída.

function normalizarTextoElegibilidade(txt) {
  if (!txt || typeof txt !== 'string') return ''
  try {
    return txt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  } catch (_) {
    return String(txt).toLowerCase().trim()
  }
}

function extrairFuncoesPro(record) {
  if (!record) return []
  let rawFuncoes = record.get('funcoes')

  // Se vier como string de bytes/números ou se for string JSON
  if (typeof rawFuncoes === 'string') {
    try {
      rawFuncoes = JSON.parse(rawFuncoes)
    } catch (_) {}
  }

  // Se for buffer / array de números (ex: [91, 34, 67, ...]) pelo Goja
  if (Array.isArray(rawFuncoes) && rawFuncoes.length > 0 && typeof rawFuncoes[0] === 'number') {
    try {
      let str = ''
      for (let i = 0; i < rawFuncoes.length; i++) {
        str += String.fromCharCode(rawFuncoes[i])
      }
      rawFuncoes = JSON.parse(str)
    } catch (_) {}
  }

  let funcoesArray = []
  if (Array.isArray(rawFuncoes)) {
    funcoesArray = rawFuncoes
  } else if (typeof rawFuncoes === 'string' && rawFuncoes.trim() !== '') {
    funcoesArray = [rawFuncoes.trim()]
  }

  const nomesResolvidos = []
  for (let fIdx = 0; fIdx < funcoesArray.length; fIdx++) {
    const item = funcoesArray[fIdx]
    if (!item || typeof item !== 'string') continue
    const valStr = item.trim()
    if (!valStr) continue

    let nomeEncontrado = ''
    try {
      const funcaoRec = $app.findRecordById('funcoes', valStr)
      if (funcaoRec) {
        nomeEncontrado = funcaoRec.getString('nome')
      }
    } catch (_) {}

    if (!nomeEncontrado) {
      try {
        const recPorNome = $app.findFirstRecordByData('funcoes', 'nome', valStr)
        if (recPorNome) {
          nomeEncontrado = recPorNome.getString('nome')
        }
      } catch (_) {}
    }

    if (!nomeEncontrado) {
      nomeEncontrado = valStr
    }

    if (nomeEncontrado && nomesResolvidos.indexOf(nomeEncontrado) === -1) {
      nomesResolvidos.push(nomeEncontrado)
    }
  }

  return nomesResolvidos
}

function proTemFuncaoDoPosto(proRecord, funcaoPosto) {
  const funcaoPostoNorm = normalizarTextoElegibilidade(funcaoPosto)
  // Se o posto não exigir função específica, qualquer pro com funções cadastradas é elegível
  if (!funcaoPostoNorm) return false

  const funcoesPro = extrairFuncoesPro(proRecord)
  if (!funcoesPro || funcoesPro.length === 0) {
    return false
  }

  for (let i = 0; i < funcoesPro.length; i++) {
    const fnNorm = normalizarTextoElegibilidade(funcoesPro[i])
    if (
      fnNorm &&
      (fnNorm === funcaoPostoNorm ||
        fnNorm.indexOf(funcaoPostoNorm) >= 0 ||
        funcaoPostoNorm.indexOf(fnNorm) >= 0)
    ) {
      return true
    }
  }
  return false
}

function turnosSobrepoem(iniA, fimA, iniB, fimB) {
  if (!iniA || !fimA || !iniB || !fimB) return false
  return iniA < fimB && iniB < fimA
}

function buscarProsElegiveisReoferta(params) {
  const escala = params.escala
  const posto = params.posto
  const proExcluidoId = params.proExcluidoId || ''
  const proEscalaFaltaId = params.proEscalaFaltaId || ''
  const now = params.now || new Date()

  const escalaId = escala.id
  const dataEscalaStr = (escala.getString('data') || '').slice(0, 10)
  const turnoInicioEscala = escala.getString('turno_inicio') || '00:00'
  const turnoFimEscala = escala.getString('turno_fim') || '23:59'
  const funcaoPosto = posto ? posto.getString('funcao') : ''

  // Buscar todas as pros ativas ou em teste ordenadas por created (limite prático 100)
  const prosCandidatas = $app.findRecordsByFilter(
    'users',
    "role = 'pro' && (status = 'ativo' || status = 'teste')",
    'created',
    100,
    0,
  )

  // Novo filtro: excluir pro que seja fixa em algum posto (referenciada no campo pro_fixo de qualquer registro de postos)
  const proFixosSet = {}
  try {
    const postosComFixo = $app.findRecordsByFilter('postos', "pro_fixo != ''", 'created', 500, 0)
    if (postosComFixo && postosComFixo.length > 0) {
      for (let pfIdx = 0; pfIdx < postosComFixo.length; pfIdx++) {
        const pfId = postosComFixo[pfIdx].getString('pro_fixo')
        if (pfId) {
          proFixosSet[pfId] = true
        }
      }
    }
  } catch (errPF) {
    console.log('[REOFERTA] Erro ao carregar pros fixas dos postos:', errPF)
  }

  // Contadores para log detalhado de exclusões
  const contadoresExclusao = {
    totalCandidatas: prosCandidatas ? prosCandidatas.length : 0,
    excluidasFuncao: 0,
    excluidasSobreposicao: 0,
    excluidasPendenteDia: 0,
    excluidasBloqueio: 0,
    excluidasPontoDia: 0,
    excluidasFixa: 0,
    excluidasOutras: 0, // proExcluidoId, proEscalaFaltaId, jaConvocadaNestaEscala
  }

  if (!prosCandidatas || prosCandidatas.length === 0) {
    console.log('[REOFERTA_FILTROS]', JSON.stringify(contadoresExclusao))
    return []
  }

  // Pre-carregar dados do mesmo dia para verificação eficiente:
  // 1. Todas as escalas não canceladas da mesma data
  let escalasDoDia = []
  try {
    escalasDoDia = $app.findRecordsByFilter(
      'escalas',
      `data ~ '${dataEscalaStr}' && status != 'cancelada'`,
      'created',
      200,
      0,
    )
  } catch (errEsc) {
    console.log('[REOFERTA] Erro ao buscar escalas da data:', errEsc)
  }

  const mapaEscalasDia = {}
  for (let eIdx = 0; eIdx < escalasDoDia.length; eIdx++) {
    mapaEscalasDia[escalasDoDia[eIdx].id] = escalasDoDia[eIdx]
  }

  const prosElegiveis = []

  for (let pIdx = 0; pIdx < prosCandidatas.length; pIdx++) {
    const p = prosCandidatas[pIdx]
    const pid = p.id

    // Exclusão de pro fixa em qualquer posto
    if (proFixosSet[pid]) {
      contadoresExclusao.excluidasFixa++
      continue
    }

    // Regra 3: Excluir a pro que faltou / pro da convocação de origem
    if (proExcluidoId && pid === proExcluidoId) {
      contadoresExclusao.excluidasOutras++
      continue
    }
    if (proEscalaFaltaId && pid === proEscalaFaltaId) {
      contadoresExclusao.excluidasOutras++
      continue
    }

    // Regra 1: Filtro de função
    if (!proTemFuncaoDoPosto(p, funcaoPosto)) {
      contadoresExclusao.excluidasFuncao++
      continue
    }

    // Exclusão por bloqueio temporário ativo
    const bloqueadoAte = p.getString('bloqueado_ate')
    if (bloqueadoAte) {
      const dtBloq = new Date(bloqueadoAte)
      if (dtBloq.getTime() > now.getTime()) {
        contadoresExclusao.excluidasBloqueio++
        continue
      }
    }

    // Exclusão: pro já convocada nesta mesma escala (a menos que seja chamada de retomada que trata isso externamente)
    let jaConvocadaNestaEscala = false
    try {
      const existing = $app.findRecordsByFilter(
        'convocacoes',
        `escala = '${escalaId}' && pro = '${pid}'`,
        '-created',
        1,
        0,
      )
      if (existing && existing.length > 0) {
        jaConvocadaNestaEscala = true
      }
    } catch (_) {}
    if (jaConvocadaNestaEscala && !params.ignorarJaConvocadaNestaEscala) {
      contadoresExclusao.excluidasOutras++
      continue
    }

    // Regra 2 (b): Registro de ponto de CHEGADA naquele dia (está trabalhando ou já trabalhou)
    let temPontoChegadaNoDia = false
    try {
      const pontosChegada = $app.findRecordsByFilter(
        'pontos',
        `pro = '${pid}' && tipo = 'chegada' && (timestamp_real >= '${dataEscalaStr} 00:00:00' || created >= '${dataEscalaStr} 00:00:00')`,
        '-timestamp_real',
        10,
        0,
      )
      if (pontosChegada && pontosChegada.length > 0) {
        for (let ptIdx = 0; ptIdx < pontosChegada.length; ptIdx++) {
          const pt = pontosChegada[ptIdx]
          const tReal = pt.getString('timestamp_real') || pt.getString('created') || ''
          if (tReal.slice(0, 10) === dataEscalaStr) {
            temPontoChegadaNoDia = true
            break
          }
        }
      }
    } catch (errPt) {
      console.log('[REOFERTA] Erro ao checar pontos de chegada da pro ' + pid + ':', errPt)
    }
    if (temPontoChegadaNoDia) {
      contadoresExclusao.excluidasPontoDia++
      continue
    }

    // Regra 2 (a) e (c): Convocação status='aceita' com turno sobreposto em QUALQUER posto
    // OU convocação status='pendente' em QUALQUER escala do mesmo dia
    let conflitoTipo = null // 'sobreposicao' | 'pendente'
    try {
      const convsPro = $app.findRecordsByFilter(
        'convocacoes',
        `pro = '${pid}' && (status = 'aceita' || status = 'pendente')`,
        '-created',
        50,
        0,
      )

      if (convsPro && convsPro.length > 0) {
        for (let cIdx = 0; cIdx < convsPro.length; cIdx++) {
          const c = convsPro[cIdx]
          const cEscalaId = c.getString('escala')
          const cStatus = c.getString('status')

          // Verificar se a convocação é para uma escala da mesma data
          let escRef = mapaEscalasDia[cEscalaId]
          if (!escRef) {
            try {
              escRef = $app.findRecordById('escalas', cEscalaId)
            } catch (_) {}
          }
          if (!escRef) continue

          const dtEscRefStr = (escRef.getString('data') || '').slice(0, 10)
          if (dtEscRefStr !== dataEscalaStr) {
            continue
          }

          // (c) convocação status='pendente' em qualquer escala do mesmo dia (já está na fila de decisão)
          if (cStatus === 'pendente') {
            conflitoTipo = 'pendente'
            break
          }

          // (a) convocação status='aceita' em QUALQUER posto com turno sobreposto
          if (cStatus === 'aceita') {
            const iniB = escRef.getString('turno_inicio') || '00:00'
            const fimB = escRef.getString('turno_fim') || '23:59'
            if (turnosSobrepoem(turnoInicioEscala, turnoFimEscala, iniB, fimB)) {
              conflitoTipo = 'sobreposicao'
              break
            }
          }
        }
      }
    } catch (errConv) {
      console.log('[REOFERTA] Erro ao checar convocações ativas da pro ' + pid + ':', errConv)
    }

    if (conflitoTipo === 'pendente') {
      contadoresExclusao.excluidasPendenteDia++
      continue
    }
    if (conflitoTipo === 'sobreposicao') {
      contadoresExclusao.excluidasSobreposicao++
      continue
    }

    prosElegiveis.push(p)
  }

  // Log detalhado de exclusões por categoria
  console.log(
    `[REOFERTA_FILTROS] Total candidatas: ${contadoresExclusao.totalCandidatas} | ` +
      `Excluídas - Fixa: ${contadoresExclusao.excluidasFixa}, Função: ${contadoresExclusao.excluidasFuncao}, ` +
      `Sobreposição: ${contadoresExclusao.excluidasSobreposicao}, Pendente no dia: ${contadoresExclusao.excluidasPendenteDia}, ` +
      `Bloqueio: ${contadoresExclusao.excluidasBloqueio}, Ponto no dia: ${contadoresExclusao.excluidasPontoDia}, ` +
      `Outras: ${contadoresExclusao.excluidasOutras} | Aprovadas: ${prosElegiveis.length}`,
  )

  if (params.retornarContadores) {
    return {
      pros: prosElegiveis,
      contadores: contadoresExclusao,
    }
  }

  return prosElegiveis
}

const elegibilidadeExports = {
  normalizarTextoElegibilidade: normalizarTextoElegibilidade,
  extrairFuncoesPro: extrairFuncoesPro,
  proTemFuncaoDoPosto: proTemFuncaoDoPosto,
  turnosSobrepoem: turnosSobrepoem,
  buscarProsElegiveisReoferta: buscarProsElegiveisReoferta,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = elegibilidadeExports
}
if (typeof globalThis !== 'undefined') {
  globalThis.ElegibilidadeReoferta = elegibilidadeExports
}
