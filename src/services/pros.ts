import pb from '@/lib/pocketbase/client'
import { UserRecord, UserDocument, UserStatus } from '@/types/facilities'

export interface CriarProPayload {
  name: string
  email: string
  telefone?: string
  cpf: string
  funcoes: string[]
  endereco_completo?: {
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
    regiao?: string
  }
  documentos?: UserDocument[]
  status?: UserStatus
  periodo_teste_dias?: number
  ajuda_custo?: number
  valor_negociado?: number
  senha_inicial?: string
}

export type VerificationOutcome = 'sent' | 'already_verified' | 'failed' | 'direct_password'

export interface CadastrarProResult {
  record: UserRecord
  verificationOutcome: VerificationOutcome
  verificationMessage?: string
  senhaDefinida?: string
}

export type ReenviarConviteOutcome = {
  type: 'access_link' | 'first_access_link' | 'verification_link'
  message: string
}

export interface AlterarEmailProResult {
  success: boolean
  message: string
  pro_id: string
  email_anterior: string
  novo_email: string
  verified: boolean
  email_enviado: boolean
  email_erro?: string | null
}

export interface AtualizarProPayload {
  name?: string
  email?: string
  telefone?: string
  cpf?: string
  funcoes?: string[]
  endereco_completo?: {
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
    regiao?: string
  }
  documentos?: UserDocument[]
  status?: UserStatus
  periodo_teste_dias?: number
  ajuda_custo?: number
  valor_negociado?: number
  observacao_teste?: string
  bloqueado_ate?: string | null
}

/**
 * Lista todos os profissionais (role = 'pro')
 */
export async function listarPros(): Promise<UserRecord[]> {
  return pb.collection('users').getFullList<UserRecord>({
    filter: 'role = "pro"',
    sort: '-created',
  })
}

/**
 * Cadastra um novo Pro.
 * Pode ser chamado por Admin ou Empresa (RH).
 * O Pro é criado com role='pro'. Dispara o hook de boas-vindas e verificação.
 */
export async function cadastrarPro(dados: CriarProPayload): Promise<CadastrarProResult> {
  const senhaInformada = dados.senha_inicial ? dados.senha_inicial.trim() : ''
  const hasSenhaInicial = Boolean(senhaInformada)

  // Se o admin definiu senha inicial: utiliza a senha escolhida e marca verified=true.
  // Se não foi informada: gera senha temporária aleatória com verified=false (fluxo de convite por e-mail).
  const effectivePassword = hasSenhaInicial
    ? senhaInformada
    : 'Pro@' + Math.random().toString(36).substring(2, 10) + '9#'

  const periodoDias = dados.periodo_teste_dias !== undefined ? Number(dados.periodo_teste_dias) : 10
  const finalStatus: UserStatus =
    periodoDias === 0 ? 'ativo' : dados.status || (periodoDias > 0 ? 'teste' : 'ativo')

  const payload: Record<string, any> = {
    email: dados.email.trim(),
    emailVisibility: true,
    name: dados.name.trim(),
    cpf: (dados.cpf || '').replace(/\D/g, ''),
    role: 'pro',
    status: finalStatus,
    password: effectivePassword,
    passwordConfirm: effectivePassword,
    telefone: (dados.telefone || '').trim(),
    funcoes: dados.funcoes || [],
    endereco_completo: dados.endereco_completo || {},
    documentos: dados.documentos || [
      { tipo: 'RG / CPF', status: 'pendente' },
      { tipo: 'Comprovante Residência', status: 'pendente' },
      { tipo: 'Certidão Antecedentes', status: 'pendente' },
    ],
    periodo_teste_dias: periodoDias,
    verified: hasSenhaInicial ? true : false,
  }

  // Preços apenas se fornecidos (por admin)
  if (dados.ajuda_custo !== undefined) {
    payload.ajuda_custo = dados.ajuda_custo
  }
  if (dados.valor_negociado !== undefined) {
    payload.valor_negociado = dados.valor_negociado
  }

  // Criação do registro no PocketBase. Caso ocorra erro 400 ou validação de hook,
  // o ClientResponseError é propagado intacto com err.data.data por campo e err.message.
  const created = await pb.collection('users').create<UserRecord>(payload)

  // Se foi criada com senha inicial mas o PocketBase não permitiu setar verified=true no create por regra de campo,
  // garantimos verified=true no registro
  let freshCreated = await pb
    .collection('users')
    .getOne<UserRecord>(created.id)
    .catch(() => created)

  if (hasSenhaInicial && !freshCreated.verified) {
    try {
      freshCreated = await pb.collection('users').update<UserRecord>(freshCreated.id, {
        verified: true,
      })
    } catch (_) {
      // Ignora silenciosamente caso a api rule restrinja verified
    }
  }

  // Se o admin definiu a senha inicial:
  // Conta nasce ativada com senha direta, NÃO envia e-mail de convite de primeiro acesso.
  if (hasSenhaInicial) {
    return {
      record: freshCreated,
      verificationOutcome: 'direct_password',
      senhaDefinida: senhaInformada,
    }
  }

  // Comportamento atual (quando senha inicial vazia): convite por e-mail com token de 24h
  let verificationOutcome: VerificationOutcome = 'sent'
  let verificationMessage: string | undefined = undefined

  if (freshCreated.verified) {
    verificationOutcome = 'already_verified'
  } else {
    try {
      await pb.collection('users').requestVerification(freshCreated.email)
    } catch (mailErr: any) {
      console.warn('Aviso: falha ao solicitar verificação de e-mail do PocketBase:', mailErr)
      const errStatus = mailErr?.status || mailErr?.response?.status
      const errMsg = (
        mailErr?.data?.data?.email?.message ||
        mailErr?.data?.message ||
        mailErr?.message ||
        ''
      ).toLowerCase()

      if (
        errMsg.includes('already verified') ||
        errMsg.includes('já verificado') ||
        errMsg.includes('already_verified')
      ) {
        verificationOutcome = 'already_verified'
      } else {
        verificationOutcome = 'failed'
        verificationMessage =
          mailErr?.data?.data?.email?.message ||
          mailErr?.data?.message ||
          mailErr?.message ||
          (errStatus ? `Status HTTP ${errStatus}` : undefined)
      }
    }
  }

  return { record: freshCreated, verificationOutcome, verificationMessage }
}

/**
 * Atualiza os dados de um Pro existente.
 */
export async function atualizarPro(id: string, dados: AtualizarProPayload): Promise<UserRecord> {
  const payload: Record<string, any> = {
    emailVisibility: true,
  }

  if (dados.name !== undefined) payload.name = dados.name.trim()
  if (dados.email !== undefined) payload.email = dados.email.trim()
  if (dados.telefone !== undefined) payload.telefone = dados.telefone.trim()
  if (dados.cpf !== undefined) payload.cpf = dados.cpf.replace(/\D/g, '')
  if (dados.funcoes !== undefined) payload.funcoes = dados.funcoes
  if (dados.endereco_completo !== undefined) payload.endereco_completo = dados.endereco_completo
  if (dados.documentos !== undefined) payload.documentos = dados.documentos
  if (dados.periodo_teste_dias !== undefined) {
    const periodo = Number(dados.periodo_teste_dias)
    payload.periodo_teste_dias = periodo
    if (periodo === 0 && (!dados.status || dados.status === 'teste')) {
      payload.status = 'ativo'
    } else if (dados.status !== undefined) {
      payload.status = dados.status
    }
  } else if (dados.status !== undefined) {
    payload.status = dados.status
  }
  if (dados.ajuda_custo !== undefined) payload.ajuda_custo = dados.ajuda_custo
  if (dados.valor_negociado !== undefined) payload.valor_negociado = dados.valor_negociado
  if (dados.observacao_teste !== undefined) payload.observacao_teste = dados.observacao_teste
  if (dados.bloqueado_ate !== undefined) payload.bloqueado_ate = dados.bloqueado_ate

  return pb.collection('users').update<UserRecord>(id, payload)
}

/**
 * Reenvia e-mail de convite / verificação para o Pro.
 * Se o pro já possui e-mail verificado (ou se o parâmetro verified for true),
 * envia requestPasswordReset (link de acesso/primeiro acesso).
 * Caso não esteja verificado, tenta requestVerification; se falhar porque já está verificado,
 * faz o fallback para requestPasswordReset.
 * Só lança erro se ambas as tentativas falharem de fato, preservando a mensagem real do backend.
 */
/**
 * Solicita reenvio do e-mail de verificação para o usuário (pro/empresa/admin).
 */
export async function reenviarVerificacaoEmail(email: string): Promise<void> {
  const cleanEmail = email.trim()
  await pb.collection('users').requestVerification(cleanEmail)
}

/**
 * Altera o e-mail de um profissional não verificado via rota administrativa dedicada
 * (executada com privilégio superuser no backend, validando unicidade e reenviando convite).
 */
export async function alterarEmailPro(
  proId: string,
  novoEmail: string,
): Promise<AlterarEmailProResult> {
  const cleanEmail = (novoEmail || '').trim().toLowerCase()
  return pb.send<AlterarEmailProResult>('/backend/v1/admin/alterar-email-pro', {
    method: 'POST',
    body: {
      pro_id: proId,
      novo_email: cleanEmail,
    },
  })
}

export async function reenviarConvitePro(
  email: string,
  verified?: boolean,
): Promise<ReenviarConviteOutcome> {
  const cleanEmail = email.trim()

  if (verified) {
    // Pro já com e-mail verificado: envia link de acesso / redefinição
    try {
      await pb.collection('users').requestPasswordReset(cleanEmail)
      return {
        type: 'access_link',
        message: `Link de acesso enviado para ${cleanEmail}.`,
      }
    } catch (resetErr: any) {
      const errMsg =
        resetErr?.data?.data?.email?.message ||
        resetErr?.data?.message ||
        resetErr?.message ||
        'Falha ao solicitar link de acesso.'
      throw new Error(errMsg)
    }
  }

  // Se o pro ainda não é verificado (verified = false), reenviamos o link de PRIMEIRO ACESSO DE 24 HORAS
  // via rota customizada do backend (/backend/v1/pros/reenviar-convite).
  // O endpoint invalida convites anteriores não usados, gera novo token de 24h e envia o e-mail.
  try {
    const res = await pb.send<{
      success: boolean
      type: 'first_access_link' | 'access_link'
      message: string
    }>('/backend/v1/pros/reenviar-convite', {
      method: 'POST',
      body: { email: cleanEmail },
    })

    return {
      type: res.type || 'first_access_link',
      message: res.message || `Link de primeiro acesso enviado para ${cleanEmail}.`,
    }
  } catch (conviteErr: any) {
    console.error('Erro ao chamar /backend/v1/pros/reenviar-convite:', conviteErr)
    // Se por qualquer razão a rota falhar ou retornar erro, tentar fallback defensivo ou propagar o erro
    const errMsg =
      conviteErr?.data?.error ||
      conviteErr?.data?.message ||
      conviteErr?.message ||
      'Falha ao enviar link de primeiro acesso.'
    throw new Error(errMsg)
  }
}
