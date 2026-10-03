export type UserRole = 'pro' | 'empresa' | 'admin'
export type UserStatus = 'ativo' | 'teste' | 'suspenso' | 'bloqueado'

export interface UserDocument {
  tipo: string
  status: 'pendente' | 'verificado' | 'rejeitado'
  arquivo_url?: string
}

export interface UserRecord {
  id: string
  email: string
  name: string
  avatar?: string
  role?: UserRole
  status?: UserStatus
  documentos?: UserDocument[]
  periodo_teste_dias?: number
  ajuda_custo?: number
  valor_negociado?: number
  bloqueado_ate?: string
  created: string
  updated: string
}

export type PostoFuncao = 'porteiro' | 'limpeza' | 'zeladoria' | 'outro'
export type PostoStatus = 'ativo' | 'inativo'

export interface Endereco {
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}

export interface PostoRecord {
  id: string
  nome: string
  funcao: PostoFuncao
  endereco: Endereco
  carga_horaria: number
  vigencia_inicio?: string
  vigencia_fim?: string
  requisitos?: string
  status: PostoStatus
  created: string
  updated: string
}

export type EscalaStatus =
  | 'aberta'
  | 'convocada'
  | 'aceita'
  | 'coberta'
  | 'falta'
  | 'cancelada'
  | 'concluida'

export interface EscalaRecord {
  id: string
  posto: string
  data: string
  turno_inicio: string
  turno_fim: string
  status: EscalaStatus
  multa_aplicada?: boolean
  valor_diaria?: number
  created: string
  updated: string
  expand?: {
    posto?: PostoRecord
  }
}

export type ConvocacaoStatus =
  | 'pendente'
  | 'aceita'
  | 'recusada'
  | 'cancelada'
  | 'coberta'
  | 'falta'

export interface ConvocacaoRecord {
  id: string
  escala: string
  pro: string
  status: ConvocacaoStatus
  valor_diaria?: number
  regra_aplicada?: string
  data_convocacao?: string
  created: string
  updated: string
  expand?: {
    escala?: EscalaRecord & { expand?: { posto?: PostoRecord } }
    pro?: UserRecord
  }
}

export type PricingRuleTipo =
  | 'base'
  | 'treinamento'
  | 'fim_semana'
  | 'feriado'
  | 'negociado'
  | 'multa_falta'

export interface PricingRuleRecord {
  id: string
  tipo: PricingRuleTipo
  posto?: string
  faixa_horas?: number
  valor: number
  dias?: number
  vigencia_inicio?: string
  vigencia_fim?: string
  created: string
  updated: string
  expand?: {
    posto?: PostoRecord
  }
}

export interface HolidayRecord {
  id: string
  data: string
  nome: string
  tipo: 'nacional' | 'municipal'
  cidade?: string
  uf?: string
  created: string
  updated: string
}

export type PayoutStatus = 'retido' | 'pago' | 'disputa' | 'cancelado'

export interface PayoutRecord {
  id: string
  escala?: string
  pro: string
  valor: number
  status: PayoutStatus
  disputa_aberta?: boolean
  data_conclusao?: string
  data_liberacao?: string
  provedor?: string
  referencia?: string
  created: string
  updated: string
  expand?: {
    escala?: EscalaRecord & { expand?: { posto?: PostoRecord } }
    pro?: UserRecord
  }
}

export interface PaymentEventRecord {
  id: string
  payout?: string
  tipo: string
  valor?: number
  metadata?: Record<string, unknown>
  data?: string
  created: string
  updated: string
  expand?: {
    payout?: PayoutRecord
  }
}

export type DisputaResolucao = 'pendente' | 'a_favor_pro' | 'a_favor_empresa'

export interface DisputaRecord {
  id: string
  payout: string
  pro: string
  motivo: string
  resolucao: DisputaResolucao
  data_abertura: string
  data_resolucao?: string
  created: string
  updated: string
  expand?: {
    payout?: PayoutRecord
    pro?: UserRecord
  }
}

export interface SettingsRecord {
  id: string
  nome_empresa: string
  logo?: string
  cor_primaria: string
  cor_secundaria: string
  guarantee_period_days: number
  dispute_period_hours: number
  payout_provider: 'mercadopago' | 'pix_manual' | 'outro'
  multa_falta_pro: number
  multa_cancelamento_pro?: number
  carencia_cancelamento_empresa?: number
  multa_empresa_cancelamento: number
  horas_bloqueio_cancelamento?: number
  limite_reincidencia_suspensao?: number
  empresa_pix_chave?: string
  empresa_pix_tipo?: string
  empresa_titular?: string
  empresa_mp_client_id?: string
  created: string
  updated: string
}

export type PixTipoChave = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

export interface ContaPixRecord {
  id: string
  pro: string
  tipo_chave: PixTipoChave
  chave: string
  provedor_conta?: string
  conta_referencia?: string
  liberada?: boolean
  data_liberacao?: string
  observacao_validacao?: string
  created: string
  updated: string
  expand?: {
    pro?: UserRecord
  }
}
