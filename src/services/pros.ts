import pb from '@/lib/pocketbase/client'
import { UserRecord, UserDocument, UserStatus } from '@/types/facilities'

export interface CriarProPayload {
  name: string
  email: string
  telefone?: string
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

export interface CadastrarProResult {
  record: UserRecord
  emailVerificationSent: boolean
}

export interface AtualizarProPayload {
  name?: string
  email?: string
  telefone?: string
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
  let emailVerificationSent = true
  try {
    await pb.collection('users').requestVerification(created.email)
  } catch (mailErr) {
    console.warn('Aviso: falha não-bloqueante ao solicitar verificação de e-mail:', mailErr)
    emailVerificationSent = false
  }

  return { record: created, emailVerificationSent }
}

/**
 * Atualiza os dados de um Pro existente.
 */
export async function atualizarPro(id: string, dados: AtualizarProPayload): Promise<UserRecord> {
  const payload: Record<string, any> = {}

  if (dados.name !== undefined) payload.name = dados.name.trim()
  if (dados.email !== undefined) payload.email = dados.email.trim()
  if (dados.telefone !== undefined) payload.telefone = dados.telefone.trim()
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
 */
export async function reenviarConvitePro(email: string): Promise<void> {
  // Solicita tanto a verificação quanto o reset de acesso para garantir que o Pro consiga entrar
  try {
    await pb.collection('users').requestVerification(email.trim())
  } catch (err) {
    // Se já verificado ou der erro, tenta link de redefinição de senha para criar primeiro acesso
    await pb.collection('users').requestPasswordReset(email.trim())
  }
}
