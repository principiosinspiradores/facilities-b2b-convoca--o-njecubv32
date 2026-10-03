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
}

export type VerificationOutcome = 'sent' | 'already_verified' | 'failed'

export interface CadastrarProResult {
  record: UserRecord
  verificationOutcome: VerificationOutcome
  verificationMessage?: string
}

export type ReenviarConviteOutcome = {
  type: 'access_link' | 'verification_link'
  message: string
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
  const tempPassword = 'Pro@' + Math.random().toString(36).substring(2, 10) + '9#'

  const payload: Record<string, any> = {
    email: dados.email.trim(),
    name: dados.name.trim(),
    cpf: (dados.cpf || '').replace(/\D/g, ''),
    role: 'pro',
    status: dados.status || 'teste',
    password: tempPassword,
    passwordConfirm: tempPassword,
    telefone: (dados.telefone || '').trim(),
    funcoes: dados.funcoes || [],
    endereco_completo: dados.endereco_completo || {},
    documentos: dados.documentos || [
      { tipo: 'RG / CPF', status: 'pendente' },
      { tipo: 'Comprovante Residência', status: 'pendente' },
      { tipo: 'Certidão Antecedentes', status: 'pendente' },
    ],
    periodo_teste_dias: dados.periodo_teste_dias !== undefined ? dados.periodo_teste_dias : 10,
    verified: false,
  }

  // Preços apenas se fornecidos (por admin)
  if (dados.ajuda_custo !== undefined) {
    payload.ajuda_custo = dados.ajuda_custo
  }
  if (dados.valor_negociado !== undefined) {
    payload.valor_negociado = dados.valor_negociado
  }

  const created = await pb.collection('users').create<UserRecord>(payload)

  // O e-mail de boas-vindas com dados completos e botão de login é disparado
  // de forma assíncrona pelo hook server-side hook_boas_vindas_pro.
  // Aqui no frontend, solicitamos o token nativo de verificação do PocketBase em modo tolerante:
  let verificationOutcome: VerificationOutcome = 'sent'
  let verificationMessage: string | undefined = undefined

  // Se o registro criado já vier verificado (ou se o backend tratar como verificado)
  if (created.verified) {
    verificationOutcome = 'already_verified'
  } else {
    try {
      await pb.collection('users').requestVerification(created.email)
    } catch (mailErr: any) {
      console.warn('Aviso: falha ao solicitar verificação de e-mail do PocketBase:', mailErr)
      const errStatus = mailErr?.status || mailErr?.response?.status
      const errMsg = (
        mailErr?.data?.data?.email?.message ||
        mailErr?.data?.message ||
        mailErr?.message ||
        ''
      ).toLowerCase()

      // Verificar se a falha indica que já está verificado
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

  return { record: created, verificationOutcome, verificationMessage }
}

/**
 * Atualiza os dados de um Pro existente.
 */
export async function atualizarPro(id: string, dados: AtualizarProPayload): Promise<UserRecord> {
  const payload: Record<string, any> = {}

  if (dados.name !== undefined) payload.name = dados.name.trim()
  if (dados.email !== undefined) payload.email = dados.email.trim()
  if (dados.telefone !== undefined) payload.telefone = dados.telefone.trim()
  if (dados.cpf !== undefined) payload.cpf = dados.cpf.replace(/\D/g, '')
  if (dados.funcoes !== undefined) payload.funcoes = dados.funcoes
  if (dados.endereco_completo !== undefined) payload.endereco_completo = dados.endereco_completo
  if (dados.documentos !== undefined) payload.documentos = dados.documentos
  if (dados.status !== undefined) payload.status = dados.status
  if (dados.periodo_teste_dias !== undefined) payload.periodo_teste_dias = dados.periodo_teste_dias
  if (dados.ajuda_custo !== undefined) payload.ajuda_custo = dados.ajuda_custo
  if (dados.valor_negociado !== undefined) payload.valor_negociado = dados.valor_negociado
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

  // Se não tem confirmação de verificado, tenta primeiro requestVerification
  try {
    await pb.collection('users').requestVerification(cleanEmail)
    return {
      type: 'verification_link',
      message: `Link de ativação e verificação enviado novamente para ${cleanEmail}.`,
    }
  } catch (verifErr: any) {
    const errMsg = (
      verifErr?.data?.data?.email?.message ||
      verifErr?.data?.message ||
      verifErr?.message ||
      ''
    ).toLowerCase()

    // Se falhou por já estar verificado ou erro similar, tenta link de acesso
    try {
      await pb.collection('users').requestPasswordReset(cleanEmail)
      return {
        type: 'access_link',
        message: `Pro já verificado. Link de acesso enviado para ${cleanEmail}.`,
      }
    } catch (resetErr: any) {
      // Ambas falharam de verdade: mostrar erro com mensagem real do backend
      const finalMsg =
        resetErr?.data?.data?.email?.message ||
        resetErr?.data?.message ||
        resetErr?.message ||
        verifErr?.data?.data?.email?.message ||
        verifErr?.data?.message ||
        verifErr?.message ||
        'Não foi possível reenviar o convite.'
      throw new Error(finalMsg)
    }
  }
}
