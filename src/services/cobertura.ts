import pb from '@/lib/pocketbase/client'
import {
  EscalaRecord,
  PostoRecord,
  UserRecord,
  ConvocacaoRecord,
  ItemAlertaCobertura,
  TipoAlertaCobertura,
  HistoricoEscalaRecord,
  HistoricoAcaoTipo,
} from '@/types/facilities'
import { estimarDiariaParaData } from '@/services/pricing'

/**
 * Utilitário para formatar tempo decorrido (aberto) em string legível pt-BR
 */
export function formatarTempoDecorrido(minutosTotais: number): string {
  if (minutosTotais < 1) return 'há menos de 1 min'
  const horas = Math.floor(minutosTotais / 60)
  const minutos = Math.floor(minutosTotais % 60)
  const dias = Math.floor(horas / 24)

  if (dias > 0) {
    const horasRest = horas % 24
    return `${dias}d ${horasRest}h atrás`
  }
  if (horas > 0) {
    return `${horas}h ${minutos}min atrás`
  }
  return `${minutos}min atrás`
}

/**
 * Processa a lista de escalas, convocações e pros para detectar alertas operacionais
 */
export function detectarAlertasCobertura(
  escalas: EscalaRecord[],
  convocacoes: ConvocacaoRecord[],
  prosElegiveisAtivos: UserRecord[],
  agora: Date = new Date(),
  todosPostos: PostoRecord[] = [],
): ItemAlertaCobertura[] {
  // Mapear profissionais que são fixas mensalistas em outros postos
  const proMensalistaPostos = new Set<string>()
  for (const p of todosPostos) {
    const forma = p.forma_de_contratacao || p.tipo_remuneracao_fixa
    if (p.pro_fixo && (forma === 'mensalista' || forma === 'mensal')) {
      proMensalistaPostos.add(p.pro_fixo)
    }
  }
  const alertas: ItemAlertaCobertura[] = []

  // Calcular limites de tempo de hoje e amanhã (UTC ou local da data)
  const hojeStr = agora.toISOString().slice(0, 10)
  const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
  const amanhaStr = amanha.toISOString().slice(0, 10)

  for (const escala of escalas) {
    const posto = escala.expand?.posto
    if (!posto) continue

    // Escalas concluídas ou canceladas não geram alertas de cobertura
    if (escala.status === 'concluida' || escala.status === 'cancelada') {
      continue
    }

    const dataEscalaStr = (escala.data || '').slice(0, 10)
    const turnoInicio = escala.turno_inicio || '07:00'
    const [hIni, mIni] = turnoInicio.split(':').map(Number)
    const [anoE, mesE, diaE] = dataEscalaStr.split('-').map(Number)

    // Data hora de início do turno
    const dataHoraTurno = new Date(anoE, (mesE || 1) - 1, diaE || 1, hIni || 0, mIni || 0)
    const diffMsAteTurno = dataHoraTurno.getTime() - agora.getTime()
    const isProximas24h =
      diffMsAteTurno >= -8 * 60 * 60 * 1000 && diffMsAteTurno <= 24 * 60 * 60 * 1000
    const isHojeOuAmanha = dataEscalaStr === hojeStr || dataEscalaStr === amanhaStr

    // Convocações vinculadas a esta escala
    const convsEscala = convocacoes.filter((c) => c.escala === escala.id)
    const convAceita = convsEscala.find((c) => c.status === 'aceita' || c.status === 'coberta')

    // Se já tem profissional aceito e não há falta aberta, escala está coberta!
    if (convAceita && escala.status !== 'falta') {
      continue
    }

    const convsPendentes = convsEscala.filter((c) => c.status === 'pendente')
    const convsFalta = convsEscala.filter((c) => c.status === 'falta')
    const convsRecusadas = convsEscala.filter(
      (c) => c.status === 'recusada' || c.status === 'cancelada',
    )

    const isPostoComFixa = !!posto.pro_fixo
    const proFixoId = posto.pro_fixo
    const proFixoObj = posto.expand?.pro_fixo

    // Pros elegíveis que ainda não foram convocados para esta escala
    // Exclui mensalistas de outros postos da elegibilidade de cobertura
    const convProIds = new Set(convsEscala.map((c) => c.pro))
    const elegiveisRestantes = prosElegiveisAtivos.filter((p) => {
      if (convProIds.has(p.id)) return false
      if (p.id === proFixoId) return false
      // Mensalista de outro posto não é elegível para cobrir falta
      if (proMensalistaPostos.has(p.id)) return false
      return true
    }).length

    // Calcular tempo aberto
    // Base: momento da ocorrência (falta, recusa ou criação da escala)
    let tempoBase = new Date(escala.created).getTime()
    if (convsFalta.length > 0) {
      // Ordenar pelas mais recentes
      const faltaMaisRecente = [...convsFalta].sort(
        (a, b) =>
          new Date(b.updated || b.created).getTime() - new Date(a.updated || a.created).getTime(),
      )[0]
      tempoBase = new Date(faltaMaisRecente.updated || faltaMaisRecente.created).getTime()
    } else if (convsPendentes.length > 0) {
      const pendenteMaisAntiga = [...convsPendentes].sort(
        (a, b) =>
          new Date(a.data_convocacao || a.created).getTime() -
          new Date(b.data_convocacao || b.created).getTime(),
      )[0]
      tempoBase = new Date(
        pendenteMaisAntiga.data_convocacao || pendenteMaisAntiga.created,
      ).getTime()
    }

    const tempoAbertoMinutos = Math.max(0, Math.floor((agora.getTime() - tempoBase) / (1000 * 60)))
    const tempoAbertoFormatado = formatarTempoDecorrido(tempoAbertoMinutos)

    // Checar Alerta 4: Recusa do pro fixo
    // Posto com pro fixa em que a pro fixa recusou a convocação (status='recusada' na convocação do pro_fixo)
    const recusaFixa = isPostoComFixa && convsRecusadas.some((c) => c.pro === proFixoId)
    const fixaTemPendente = isPostoComFixa && convsPendentes.some((c) => c.pro === proFixoId)

    // Checar Alerta 2: Falta confirmada, cobertura pendente
    // Pro faltou (escala.status === 'falta' ou existe conv com status === 'falta'), reoferta disparada mas ninguém aceitou ainda
    const temFaltaConfirmada = escala.status === 'falta' || convsFalta.length > 0
    const faltaComReofertaPendente = temFaltaConfirmada && convsPendentes.length > 0 && !convAceita

    // Checar Alerta 3: Reoferta esgotada
    // Reoferta passou por elegíveis (ou não há mais elegíveis) e ninguém aceitou (todas recusadas e 0 pendentes)
    const reofertaEsgotada =
      !convAceita &&
      convsPendentes.length === 0 &&
      (convsRecusadas.length > 0 || escala.status === 'convocada' || temFaltaConfirmada) &&
      elegiveisRestantes === 0

    // Checar Alerta 1: Posto descoberto — sem ninguém
    // Escala de hoje/amanhã sem pro aceito e nenhuma reoferta em andamento (0 pendentes e 0 aceitos)
    const postoDescobertoSemNinguem =
      !convAceita && convsPendentes.length === 0 && !reofertaEsgotada && isHojeOuAmanha

    // Classificação com prioridade:
    // 1. Falta confirmada com reoferta pendente (Urgente - cronômetro ativo)
    // 2. Reoferta esgotada (Turno perdido, exige ação manual imediata)
    // 3. Posto descoberto — sem ninguém (Escala de hoje/amanhã desguarnecida)
    // 4. Recusa do pro fixo (Fixa recusou, empresa deve ser informada)

    if (faltaComReofertaPendente) {
      const proFaltouObj = convsFalta[0]?.expand?.pro
      alertas.push({
        id: `falta_${escala.id}`,
        escala,
        posto,
        tipoAlerta: 'falta_pendente',
        tituloAlerta: 'Falta confirmada, cobertura pendente',
        corBadge: 'vermelho',
        gravidade: 'alta',
        tempoAbertoFormatado,
        tempoAbertoMinutos,
        proFalta: proFaltouObj,
        convocacoesAtivas: convsPendentes,
        convocacoesRecusadas: convsRecusadas,
        elegiveisRestantes,
        situacaoAtual: `Falta de ${proFaltouObj?.name || 'Profissional'}. ${convsPendentes.length} reoferta(s) aguardando aceite.`,
        dataInicioTurno: dataHoraTurno,
        isProximas24h,
      })
      continue
    }

    if (reofertaEsgotada) {
      alertas.push({
        id: `esgotada_${escala.id}`,
        escala,
        posto,
        tipoAlerta: 'reoferta_esgotada',
        tituloAlerta: 'Reoferta esgotada',
        corBadge: 'vermelho',
        gravidade: 'alta',
        tempoAbertoFormatado,
        tempoAbertoMinutos,
        convocacoesAtivas: convsPendentes,
        convocacoesRecusadas: convsRecusadas,
        elegiveisRestantes: 0,
        situacaoAtual: `Todos os profissionais elegíveis (${convsRecusadas.length}) recusaram. Turno desguarnecido requer ação manual.`,
        dataInicioTurno: dataHoraTurno,
        isProximas24h,
      })
      continue
    }

    if (recusaFixa && !convAceita) {
      alertas.push({
        id: `recusa_fixa_${escala.id}`,
        escala,
        posto,
        tipoAlerta: 'recusa_fixa',
        tituloAlerta: 'Recusa do pro fixo',
        corBadge: 'amarelo',
        gravidade: 'media',
        tempoAbertoFormatado,
        tempoAbertoMinutos,
        proFixo: proFixoObj,
        convocacoesAtivas: convsPendentes,
        convocacoesRecusadas: convsRecusadas,
        elegiveisRestantes,
        situacaoAtual: `Titular fixa ${proFixoObj?.name || 'designada'} recusou. ${
          convsPendentes.length > 0
            ? `${convsPendentes.length} reoferta(s) freelancer em andamento.`
            : 'Reoferta freelancer necessária.'
        }`,
        dataInicioTurno: dataHoraTurno,
        isProximas24h,
      })
      continue
    }

    if (postoDescobertoSemNinguem) {
      alertas.push({
        id: `descoberto_${escala.id}`,
        escala,
        posto,
        tipoAlerta: 'posto_descoberto',
        tituloAlerta: 'Posto descoberto — sem ninguém',
        corBadge: 'vermelho',
        gravidade: 'alta',
        tempoAbertoFormatado,
        tempoAbertoMinutos,
        convocacoesAtivas: convsPendentes,
        convocacoesRecusadas: convsRecusadas,
        elegiveisRestantes,
        situacaoAtual:
          isPostoComFixa && fixaTemPendente
            ? `Aguardando confirmação da titular fixa (${proFixoObj?.name || 'designada'}).`
            : 'Nenhum profissional aceito e nenhuma convocação ativa no momento.',
        dataInicioTurno: dataHoraTurno,
        isProximas24h,
      })
      continue
    }

    // Se a escala estiver em 'aberta' ou 'convocada' com turnos futuros e sem ninguém aceito,
    // mas não se encaixou acima (ex: mais de 48h com 0 pendentes)
    if (
      !convAceita &&
      (escala.status === 'aberta' || (convsPendentes.length === 0 && convsRecusadas.length === 0))
    ) {
      alertas.push({
        id: `aberta_${escala.id}`,
        escala,
        posto,
        tipoAlerta: 'posto_descoberto',
        tituloAlerta: 'Posto descoberto — sem ninguém',
        corBadge: 'vermelho',
        gravidade: 'alta',
        tempoAbertoFormatado,
        tempoAbertoMinutos,
        convocacoesAtivas: convsPendentes,
        convocacoesRecusadas: convsRecusadas,
        elegiveisRestantes,
        situacaoAtual: 'Escala aberta sem convocação ativa.',
        dataInicioTurno: dataHoraTurno,
        isProximas24h,
      })
    }
  }

  // Enriquecer os alertas com o contexto de grupo de vagas (posto/data/turno)
  // Agrupar escalas do mesmo posto, data e turno para indicar vagas pendentes (ex: "2 de 5 vagas abertas")
  const contagemGrupo = new Map<string, { total: number; cobertas: number }>()
  for (const esc of escalas) {
    if (esc.status === 'concluida' || esc.status === 'cancelada') continue
    const d = (esc.data || '').slice(0, 10)
    const chave = `${esc.posto}_${d}_${esc.turno_inicio}_${esc.turno_fim}`
    const atual = contagemGrupo.get(chave) || { total: 0, cobertas: 0 }
    atual.total++

    const convs = convocacoes.filter((c) => c.escala === esc.id)
    const isCoberta =
      convs.some((c) => c.status === 'aceita' || c.status === 'coberta') ||
      esc.status === 'aceita' ||
      esc.status === 'coberta'
    if (isCoberta) {
      atual.cobertas++
    }
    contagemGrupo.set(chave, atual)
  }

  for (const alerta of alertas) {
    const d = (alerta.escala.data || '').slice(0, 10)
    const chave = `${alerta.posto.id}_${d}_${alerta.escala.turno_inicio}_${alerta.escala.turno_fim}`
    const infoGrupo = contagemGrupo.get(chave)
    if (infoGrupo && infoGrupo.total > 1) {
      alerta.totalVagas = infoGrupo.total
      alerta.vagasCobertas = infoGrupo.cobertas
      alerta.vagasAbertas = Math.max(0, infoGrupo.total - infoGrupo.cobertas)
      alerta.situacaoAtual = `${alerta.vagasAbertas} de ${alerta.totalVagas} vagas abertas no turno. ${alerta.situacaoAtual}`
    } else {
      alerta.totalVagas = 1
      alerta.vagasCobertas = 0
      alerta.vagasAbertas = 1
    }
  }

  // Ordenar alertas por urgência:
  // 1º turnos das próximas 24h primeiro
  // 2º dataHoraTurno mais próxima
  // 3º gravidade (alta primeiro)
  return alertas.sort((a, b) => {
    if (a.isProximas24h && !b.isProximas24h) return -1
    if (!a.isProximas24h && b.isProximas24h) return 1
    const diffTime = a.dataInicioTurno.getTime() - b.dataInicioTurno.getTime()
    if (diffTime !== 0) return diffTime
    if (a.gravidade === 'alta' && b.gravidade !== 'alta') return -1
    if (a.gravidade !== 'alta' && b.gravidade === 'alta') return 1
    return b.tempoAbertoMinutos - a.tempoAbertoMinutos
  })
}

/**
 * Registra um evento no histórico da escala
 */
export async function registrarHistoricoEscala(params: {
  escalaId: string
  usuarioId: string
  acao: HistoricoAcaoTipo
  descricao: string
  detalhes?: Record<string, unknown>
}): Promise<HistoricoEscalaRecord> {
  return await pb.collection('historico_escalas').create<HistoricoEscalaRecord>({
    escala: params.escalaId,
    usuario: params.usuarioId,
    acao: params.acao,
    descricao: params.descricao,
    detalhes: params.detalhes || {},
  })
}

/**
 * Busca o histórico de reaberturas e eventos de uma escala específica
 */
export async function listarHistoricoDaEscala(escalaId: string): Promise<HistoricoEscalaRecord[]> {
  try {
    return await pb.collection('historico_escalas').getFullList<HistoricoEscalaRecord>({
      filter: `escala = "${escalaId}"`,
      sort: '-created',
      expand: 'usuario',
    })
  } catch (err) {
    console.error('Erro ao listar histórico da escala:', err)
    return []
  }
}

/**
 * Executa a Ação Rápida: Abrir Convocação Manual
 * Permite reenviar o turno para os pros elegíveis (todos ou selecionados) ou direcionar para um pro específico,
 * respeitando as regras de pro fixo vs freelancer e o motor de 3 camadas.
 * Registra o histórico da escala.
 */
export async function executarConvocacaoManual(params: {
  escala: EscalaRecord
  posto: PostoRecord
  usuarioId: string
  usuarioNome: string
  proIdsSelecionados: string[]
  todosElegiveis: boolean
  prosBase: UserRecord[]
  convocacoesAtuais: ConvocacaoRecord[]
  todosPostos?: PostoRecord[]
}): Promise<{ criadas: number; escalaAtualizada: boolean }> {
  const {
    escala,
    posto,
    usuarioId,
    usuarioNome,
    proIdsSelecionados,
    todosElegiveis,
    prosBase,
    convocacoesAtuais,
    todosPostos = [],
  } = params

  const carga = posto.carga_horaria || 8
  const end = (posto.endereco as any) || {}
  const isPostoComFixa = !!posto.pro_fixo
  const proFixoId = posto.pro_fixo

  // Mapear profissionais que são fixas mensalistas e seus postos
  // Regra: "geralmente o mensal fixo não cobre outros postos"
  // Mensalista de outro posto NÃO é elegível para cobertura de falta
  const postosComMensalista = todosPostos.filter((p) => {
    const forma = p.forma_de_contratacao || p.tipo_remuneracao_fixa
    return p.pro_fixo && (forma === 'mensalista' || forma === 'mensal')
  })
  const proMensalistaOutrosPostos = new Set<string>()
  for (const p of postosComMensalista) {
    if (p.id !== posto.id && p.pro_fixo) {
      proMensalistaOutrosPostos.add(p.pro_fixo)
    }
  }

  // Mapear também postos com horistas para saber o valor_hora do candidato
  const mapaHoristasPostos: Record<string, number> = {}
  for (const p of todosPostos) {
    const forma = p.forma_de_contratacao || p.tipo_remuneracao_fixa
    if (p.pro_fixo && (forma === 'horista' || forma === 'por_hora')) {
      const vHora =
        p.valor_hora !== undefined ? Number(p.valor_hora) : Number(p.valor_remuneracao_fixa || 0)
      if (vHora > 0) {
        mapaHoristasPostos[p.pro_fixo] = vHora
      }
    }
  }

  // 1. Determinar lista de pros a convocar (excluindo mensalistas de outros postos)
  let prosAlvo: UserRecord[] = []
  if (todosElegiveis) {
    const jaConvocadosIds = new Set(
      convocacoesAtuais
        .filter((c) => c.escala === escala.id && c.status === 'pendente')
        .map((c) => c.pro),
    )
    prosAlvo = prosBase.filter(
      (p) =>
        p.role === 'pro' &&
        (p.status === 'ativo' || p.status === 'teste') &&
        !jaConvocadosIds.has(p.id) &&
        !proMensalistaOutrosPostos.has(p.id),
    )
  } else {
    prosAlvo = prosBase.filter(
      (p) => proIdsSelecionados.includes(p.id) && !proMensalistaOutrosPostos.has(p.id),
    )
  }

  if (prosAlvo.length === 0) {
    throw new Error('Nenhum profissional elegível selecionado para convocação.')
  }

  // 2. Determinar diária estimada pelo motor para freelancers
  const dataIso = escala.data ? escala.data.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const estimativa = await estimarDiariaParaData(posto.id, dataIso, carga, end.cidade, end.uf)

  const nowIso = new Date().toISOString()
  let criadas = 0

  for (const pro of prosAlvo) {
    const isEsteProFixo = isPostoComFixa && pro.id === proFixoId
    const formaPosto = posto.forma_de_contratacao || posto.tipo_remuneracao_fixa

    let valorCalculado = estimativa.valor || escala.valor_diaria || 180
    let regraCalculada = estimativa.regra || 'motor 3 camadas (convocação manual)'

    if (isEsteProFixo) {
      if (formaPosto === 'mensalista' || formaPosto === 'mensal') {
        valorCalculado = 0
        regraCalculada = 'Contrato Mensal Fixo — Remuneração Salarial'
      } else {
        const vHora =
          posto.valor_hora !== undefined
            ? Number(posto.valor_hora)
            : Number(posto.valor_remuneracao_fixa || 25)
        valorCalculado = vHora * carga
        regraCalculada = `profissional fixa horista (R$ ${vHora.toFixed(2)}/h × ${carga}h)`
      }
    } else {
      // Valor ofertado segue QUEM VAI CUMPRIR:
      // se o candidato é fixa horista em algum posto: horas do turno × valor_hora do candidato
      const valorHoraCandidato = mapaHoristasPostos[pro.id]
      if (valorHoraCandidato && valorHoraCandidato > 0) {
        valorCalculado = valorHoraCandidato * carga
        regraCalculada = `cobertura horista (R$ ${valorHoraCandidato.toFixed(2)}/h × ${carga}h)`
      } else if (pro.status === 'teste') {
        valorCalculado = pro.ajuda_custo || 50
        regraCalculada = 'ajuda de custo (teste)'
      } else if (pro.valor_negociado && pro.valor_negociado > 0) {
        valorCalculado = pro.valor_negociado
        regraCalculada = 'valor negociado'
      }
    }

    // Criar nova convocação com status pendente
    await pb.collection('convocacoes').create({
      escala: escala.id,
      pro: pro.id,
      status: 'pendente',
      valor_diaria: valorCalculado,
      regra_aplicada: regraCalculada,
      data_convocacao: nowIso,
    })
    criadas++
  }

  // 3. Atualizar status da escala para 'convocada'
  await pb.collection('escalas').update(escala.id, {
    status: 'convocada',
    ...(escala.valor_diaria ? {} : { valor_diaria: estimativa.valor || 180 }),
  })

  // 4. Registrar histórico da escala
  const nomesPros = prosAlvo
    .map((p) => p.name || p.email)
    .slice(0, 5)
    .join(', ')
  const resumoPros = prosAlvo.length > 5 ? `${nomesPros} e mais ${prosAlvo.length - 5}` : nomesPros

  await registrarHistoricoEscala({
    escalaId: escala.id,
    usuarioId,
    acao: 'convocacao_manual',
    descricao: `Convocação manual disparada por ${usuarioNome} para ${prosAlvo.length} pro(s): ${resumoPros}.`,
    detalhes: {
      total_pros: prosAlvo.length,
      pro_ids: prosAlvo.map((p) => p.id),
      modo: todosElegiveis ? 'todos_elegiveis' : 'selecionados',
      turno_data: escala.data,
      posto_nome: posto.nome,
    },
  })

  return { criadas, escalaAtualizada: true }
}
