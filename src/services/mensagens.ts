import pb from '@/lib/pocketbase/client'
import { MensagemConversaRecord, MensagemRecord, UserRecord } from '@/types/facilities'

/**
 * Lista as conversas visíveis para o usuário de acordo com as regras de negócio:
 * - Pro: apenas conversas em que é participante/pro
 * - Empresa: todas as conversas entre profissionais e a empresa
 * - Admin: todas as conversas do sistema (mediação)
 */
export async function listarConversas(
  userId: string,
  role: string,
): Promise<MensagemConversaRecord[]> {
  let filter = ''
  if (role === 'pro') {
    filter = `pro = "${userId}" || participantes.id ?= "${userId}"`
  } else if (role === 'empresa') {
    // Empresa vê todas as conversas dos pros
    filter = 'id != ""'
  } else {
    // Admin vê todas
    filter = 'id != ""'
  }

  const records = await pb.collection('mensagens_conversas').getFullList<MensagemConversaRecord>({
    filter,
    sort: '-ultima_mensagem_data,-updated',
    expand:
      'pro,participantes,escala,escala.posto,convocacao,convocacao.escala,convocacao.escala.posto',
  })

  return records
}

/**
 * Obtém ou cria uma conversa contextual para uma convocação/escala.
 * Impede que profissionais conversem entre si.
 */
export async function obterOuCriarConversaContextual(params: {
  proId: string
  escalaId?: string
  convocacaoId?: string
  tituloContexto: string
  criadorId: string
}): Promise<MensagemConversaRecord> {
  const { proId, escalaId, convocacaoId, tituloContexto, criadorId } = params

  // 1. Procurar conversa existente com os mesmos parâmetros
  let filter = `tipo = "contextual" && pro = "${proId}"`
  if (convocacaoId) {
    filter += ` && convocacao = "${convocacaoId}"`
  } else if (escalaId) {
    filter += ` && escala = "${escalaId}"`
  }

  try {
    const existentes = await pb
      .collection('mensagens_conversas')
      .getList<MensagemConversaRecord>(1, 1, {
        filter,
        expand:
          'pro,participantes,escala,escala.posto,convocacao,convocacao.escala,convocacao.escala.posto',
      })

    if (existentes.items.length > 0) {
      return existentes.items[0]
    }
  } catch (err) {
    console.warn('Erro ao pesquisar conversa contextual existente:', err)
  }

  // 2. Não existe: criar nova
  const participantes = Array.from(new Set([proId, criadorId]))

  const nova = await pb.collection('mensagens_conversas').create<MensagemConversaRecord>(
    {
      tipo: 'contextual',
      pro: proId,
      participantes,
      escala: escalaId || null,
      convocacao: convocacaoId || null,
      titulo_contexto: tituloContexto,
      ultima_mensagem_texto: 'Conversa iniciada sobre o turno.',
      ultima_mensagem_data: new Date().toISOString(),
      leitura_pro_em: new Date().toISOString(),
      leitura_empresa_em: new Date().toISOString(),
    },
    {
      expand:
        'pro,participantes,escala,escala.posto,convocacao,convocacao.escala,convocacao.escala.posto',
    },
  )

  return nova
}

/**
 * Obtém ou cria uma conversa direta entre a empresa e um profissional específico.
 */
export async function obterOuCriarConversaDireta(
  proId: string,
  criadorId: string,
  proNome?: string,
): Promise<MensagemConversaRecord> {
  const filter = `tipo = "direta" && pro = "${proId}"`

  try {
    const existentes = await pb
      .collection('mensagens_conversas')
      .getList<MensagemConversaRecord>(1, 1, {
        filter,
        expand: 'pro,participantes',
      })

    if (existentes.items.length > 0) {
      return existentes.items[0]
    }
  } catch (err) {
    console.warn('Erro ao pesquisar conversa direta existente:', err)
  }

  const participantes = Array.from(new Set([proId, criadorId]))

  const nova = await pb.collection('mensagens_conversas').create<MensagemConversaRecord>(
    {
      tipo: 'direta',
      pro: proId,
      participantes,
      titulo_contexto: proNome ? `Conversa com ${proNome}` : 'Mensagem Direta',
      ultima_mensagem_texto: 'Canal de comunicação aberto.',
      ultima_mensagem_data: new Date().toISOString(),
      leitura_pro_em: new Date().toISOString(),
      leitura_empresa_em: new Date().toISOString(),
    },
    {
      expand: 'pro,participantes',
    },
  )

  return nova
}

/**
 * Lista as mensagens de uma conversa específica em ordem cronológica crescente.
 */
export async function listarMensagens(conversaId: string): Promise<MensagemRecord[]> {
  const records = await pb.collection('mensagens_mensagens').getFullList<MensagemRecord>({
    filter: `conversa = "${conversaId}"`,
    sort: 'created',
    expand: 'remetente',
  })
  return records
}

/**
 * Envia uma mensagem e atualiza o resumo da conversa (última mensagem e data).
 */
export async function enviarMensagem(params: {
  conversaId: string
  remetenteId: string
  remetenteRole: string
  texto: string
}): Promise<MensagemRecord> {
  const { conversaId, remetenteId, remetenteRole, texto } = params

  const destinatarioTipo = remetenteRole === 'pro' ? 'empresa' : 'pro'
  const nowIso = new Date().toISOString()

  // 1. Criar o registro da mensagem
  const novaMsg = await pb.collection('mensagens_mensagens').create<MensagemRecord>(
    {
      conversa: conversaId,
      remetente: remetenteId,
      destinatario_tipo: destinatarioTipo,
      texto: texto.trim(),
      lida: false,
    },
    {
      expand: 'remetente',
    },
  )

  // 2. Atualizar a conversa correspondente
  const updateData: Record<string, any> = {
    ultima_mensagem_texto: texto.trim(),
    ultima_mensagem_data: nowIso,
  }

  if (remetenteRole === 'pro') {
    updateData.leitura_pro_em = nowIso
  } else {
    updateData.leitura_empresa_em = nowIso
  }

  try {
    await pb.collection('mensagens_conversas').update(conversaId, updateData)
  } catch (err) {
    console.warn('Erro ao atualizar resumo da conversa:', err)
  }

  return novaMsg
}

/**
 * Marca uma conversa como lida pelo usuário atual
 */
export async function marcarConversaComoLida(
  conversaId: string,
  userRole: string,
  userId: string,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const updateData: Record<string, any> = {}

  if (userRole === 'pro') {
    updateData.leitura_pro_em = nowIso
  } else {
    // Empresa ou admin lendo
    updateData.leitura_empresa_em = nowIso
  }

  try {
    await pb.collection('mensagens_conversas').update(conversaId, updateData)

    // Atualiza mensagens pendentes para lida se foram enviadas pelo outro lado
    const msgsNaoLidas = await pb.collection('mensagens_mensagens').getList(1, 50, {
      filter: `conversa = "${conversaId}" && remetente != "${userId}" && (lida = false || lida = null)`,
    })

    await Promise.all(
      msgsNaoLidas.items.map((m) =>
        pb
          .collection('mensagens_mensagens')
          .update(m.id, {
            lida: true,
            lida_em: nowIso,
          })
          .catch(() => null),
      ),
    )
  } catch (err) {
    console.warn('Erro ao marcar conversa como lida:', err)
  }
}

/**
 * Conta mensagens não lidas no sistema para o perfil do usuário
 */
export async function contarNaoLidas(userId: string, userRole: string): Promise<number> {
  try {
    if (userRole === 'pro') {
      const res = await pb.collection('mensagens_mensagens').getList(1, 1, {
        filter: `conversa.pro = "${userId}" && remetente != "${userId}" && (lida = false || lida = null)`,
      })
      return res.totalItems
    } else {
      // Empresa / Admin: mensagens enviadas pelos profissionais que ainda não foram marcadas como lidas
      const res = await pb.collection('mensagens_mensagens').getList(1, 1, {
        filter: `remetente.role = "pro" && (lida = false || lida = null)`,
      })
      return res.totalItems
    }
  } catch {
    return 0
  }
}
