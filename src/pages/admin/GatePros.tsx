import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { UserRecord, UserStatus, FuncaoRecord, UserDocument } from '@/types/facilities'
import { formatCurrencyBRL, formatDateTimeBR } from '@/lib/formatters'
import { listarFuncoes } from '@/services/funcoes'
import { cadastrarPro, atualizarPro, reenviarConvitePro } from '@/services/pros'
import { formatarCPF, mascararCPF, validarCPF } from '@/lib/cpf'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import {
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  Edit,
  Lock,
  Unlock,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Search,
  Upload,
  ExternalLink,
  RefreshCw,
  Clock,
} from 'lucide-react'

export default function GateProsPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isEmpresa = role === 'empresa'

  const [pros, setPros] = useState<UserRecord[]>([])
  const [funcoesCatalogo, setFuncoesCatalogo] = useState<FuncaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [filterFuncao, setFilterFuncao] = useState<string>('todas')

  // Modal Cadastro de Novo Pro
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newTelefone, setNewTelefone] = useState('')
  const [newCpf, setNewCpf] = useState('')
  const [newFuncoes, setNewFuncoes] = useState<string[]>([])
  const [newRegiao, setNewRegiao] = useState('')
  const [newCidade, setNewCidade] = useState('São Paulo')
  const [newUf, setNewUf] = useState('SP')
  const [newLogradouro, setNewLogradouro] = useState('')
  const [newBairro, setNewBairro] = useState('')
  const [newCep, setNewCep] = useState('')
  const [newPeriodoTeste, setNewPeriodoTeste] = useState(10)
  const [newAjudaCusto, setNewAjudaCusto] = useState(50)
  const [newValorNegociado, setNewValorNegociado] = useState<number | undefined>(undefined)
  const [newDocumentos, setNewDocumentos] = useState<UserDocument[]>([
    { tipo: 'RG / CPF', status: 'pendente' },
    { tipo: 'Comprovante Residência', status: 'pendente' },
    { tipo: 'Certidão Antecedentes', status: 'pendente' },
  ])

  // Modal de Avaliação de Gate & Edição de Pro
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedPro, setSelectedPro] = useState<UserRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editTelefone, setEditTelefone] = useState('')
  const [editCpf, setEditCpf] = useState('')
  const [editFuncoes, setEditFuncoes] = useState<string[]>([])
  const [editRegiao, setEditRegiao] = useState('')
  const [editCidade, setEditCidade] = useState('')
  const [editUf, setEditUf] = useState('')
  const [editLogradouro, setEditLogradouro] = useState('')
  const [editBairro, setEditBairro] = useState('')
  const [editCep, setEditCep] = useState('')
  const [editStatus, setEditStatus] = useState<UserStatus>('ativo')
  const [editPeriodoTeste, setEditPeriodoTeste] = useState(10)
  const [editAjudaCusto, setEditAjudaCusto] = useState(50)
  const [editValorNegociado, setEditValorNegociado] = useState<number | undefined>(undefined)
  const [editDocumentos, setEditDocumentos] = useState<UserDocument[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Modal para Justificativa de Recusa de Documento
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectDocIndex, setRejectDocIndex] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [targetModalType, setTargetModalType] = useState<'create' | 'edit'>('edit')

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [prosRes, funcoesRes] = await Promise.all([
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: '-created',
        }),
        listarFuncoes(false),
      ])
      setPros(prosRes)
      setFuncoesCatalogo(funcoesRes)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a lista de profissionais ou funções.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Limpar formulário de novo Pro
  const openCreateModal = () => {
    setNewName('')
    setNewEmail('')
    setNewTelefone('')
    setNewCpf('')
    // Pré-selecionar a primeira função ativa se houver
    const primeiraAtiva = funcoesCatalogo.find((f) => f.ativo)?.nome || 'Limpeza'
    setNewFuncoes([primeiraAtiva])
    setNewRegiao('Grande São Paulo')
    setNewCidade('São Paulo')
    setNewUf('SP')
    setNewLogradouro('')
    setNewBairro('')
    setNewCep('')
    setNewPeriodoTeste(10)
    setNewAjudaCusto(50)
    setNewValorNegociado(undefined)
    setNewDocumentos([
      { tipo: 'RG / CPF', status: 'pendente' },
      { tipo: 'Comprovante Residência', status: 'pendente' },
      { tipo: 'Certidão Antecedentes', status: 'pendente' },
    ])
    setCreateModalOpen(true)
  }

  // Abrir modal de edição/avaliação
  const openEditModal = (pro: UserRecord) => {
    setSelectedPro(pro)
    setEditName(pro.name || '')
    setEditEmail(pro.email || '')
    setEditTelefone(pro.telefone || '')
    setEditCpf(formatarCPF(pro.cpf || ''))

    // Funções
    const funcs = Array.isArray(pro.funcoes) ? pro.funcoes : []
    setEditFuncoes(funcs.length > 0 ? funcs : ['Geral'])

    // Endereço / Região
    const end = (pro.endereco_completo as any) || {}
    setEditRegiao(end.regiao || '')
    setEditCidade(end.cidade || '')
    setEditUf(end.uf || 'SP')
    setEditLogradouro(end.logradouro || '')
    setEditBairro(end.bairro || '')
    setEditCep(end.cep || '')

    const periodoPro = pro.periodo_teste_dias !== undefined ? pro.periodo_teste_dias : 10
    setEditPeriodoTeste(periodoPro)
    setEditStatus(pro.status || (periodoPro === 0 ? 'ativo' : 'teste'))
    setEditAjudaCusto(pro.ajuda_custo || 50)
    setEditValorNegociado(pro.valor_negociado)

    const docs: UserDocument[] =
      pro.documentos && pro.documentos.length > 0
        ? pro.documentos
        : [
            { tipo: 'RG / CPF', status: 'pendente' },
            { tipo: 'Comprovante Residência', status: 'pendente' },
            { tipo: 'Certidão Antecedentes', status: 'pendente' },
          ]
    setEditDocumentos(docs)
    setEditModalOpen(true)
  }

  // Alternar função selecionada (checkbox/toggle)
  const toggleFuncao = (nomeFuncao: string, isForCreate: boolean) => {
    if (isForCreate) {
      if (newFuncoes.includes(nomeFuncao)) {
        if (newFuncoes.length > 1) {
          setNewFuncoes(newFuncoes.filter((f) => f !== nomeFuncao))
        }
      } else {
        setNewFuncoes([...newFuncoes, nomeFuncao])
      }
    } else {
      if (editFuncoes.includes(nomeFuncao)) {
        if (editFuncoes.length > 1) {
          setEditFuncoes(editFuncoes.filter((f) => f !== nomeFuncao))
        }
      } else {
        setEditFuncoes([...editFuncoes, nomeFuncao])
      }
    }
  }

  // Upload simulado de documento (converte para data URL ou anexa nome)
  const handleDocFileUpload = (index: number, file: File, isForCreate: boolean) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (isForCreate) {
        const updated = [...newDocumentos]
        updated[index] = {
          ...updated[index],
          arquivo_url: dataUrl,
          arquivo_nome: file.name,
          status: 'pendente',
        }
        setNewDocumentos(updated)
      } else {
        const updated = [...editDocumentos]
        updated[index] = {
          ...updated[index],
          arquivo_url: dataUrl,
          arquivo_nome: file.name,
          status: 'pendente',
        }
        setEditDocumentos(updated)
      }
      toast({
        title: 'Arquivo anexado com sucesso',
        description: `O arquivo ${file.name} foi adicionado para avaliação de conformidade.`,
      })
    }
    reader.readAsDataURL(file)
  }

  // Avaliação do Documento: Aprovar direto ou Abrir justificativa para Rejeitar
  const handleDocApprove = (index: number, isForCreate: boolean) => {
    if (isForCreate) {
      const updated = [...newDocumentos]
      updated[index] = {
        ...updated[index],
        status: 'verificado',
        justificativa_recusa: undefined,
        avaliado_em: new Date().toISOString(),
      }
      setNewDocumentos(updated)
    } else {
      const updated = [...editDocumentos]
      updated[index] = {
        ...updated[index],
        status: 'verificado',
        justificativa_recusa: undefined,
        avaliado_em: new Date().toISOString(),
      }
      setEditDocumentos(updated)
    }
  }

  const handleDocRejectInit = (index: number, isForCreate: boolean) => {
    setRejectDocIndex(index)
    setTargetModalType(isForCreate ? 'create' : 'edit')
    const currentDoc = isForCreate ? newDocumentos[index] : editDocumentos[index]
    setRejectReason(currentDoc?.justificativa_recusa || '')
    setRejectModalOpen(true)
  }

  const handleConfirmReject = () => {
    if (rejectDocIndex === null) return
    if (!rejectReason.trim()) {
      toast({
        title: 'Justificativa obrigatória',
        description: 'Informe o motivo da recusa para orientar o profissional.',
        variant: 'destructive',
      })
      return
    }

    if (targetModalType === 'create') {
      const updated = [...newDocumentos]
      updated[rejectDocIndex] = {
        ...updated[rejectDocIndex],
        status: 'rejeitado',
        justificativa_recusa: rejectReason.trim(),
        avaliado_em: new Date().toISOString(),
      }
      setNewDocumentos(updated)
    } else {
      const updated = [...editDocumentos]
      updated[rejectDocIndex] = {
        ...updated[rejectDocIndex],
        status: 'rejeitado',
        justificativa_recusa: rejectReason.trim(),
        avaliado_em: new Date().toISOString(),
      }
      setEditDocumentos(updated)
    }

    setRejectModalOpen(false)
    setRejectDocIndex(null)
    setRejectReason('')
  }

  // Criar novo Pro
  const handleCreatePro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim() || !newCpf.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Nome completo, e-mail e CPF válido são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    if (!validarCPF(newCpf)) {
      toast({
        title: 'CPF inválido',
        description: 'Digite um CPF válido com 11 dígitos e dígitos verificadores corretos.',
        variant: 'destructive',
      })
      return
    }

    setIsCreating(true)
    try {
      const res = await cadastrarPro({
        name: newName,
        email: newEmail,
        cpf: newCpf,
        telefone: newTelefone,
        funcoes: newFuncoes.length > 0 ? newFuncoes : ['Geral'],
        endereco_completo: {
          regiao: newRegiao,
          logradouro: newLogradouro,
          bairro: newBairro,
          cidade: newCidade,
          uf: newUf,
          cep: newCep,
        },
        documentos: newDocumentos,
        status: Number(newPeriodoTeste) === 0 ? 'ativo' : 'teste',
        periodo_teste_dias: Number(newPeriodoTeste) >= 0 ? Number(newPeriodoTeste) : 0,
        ...(isAdmin
          ? {
              ajuda_custo: Number(newAjudaCusto) || 50,
              valor_negociado: newValorNegociado ? Number(newValorNegociado) : undefined,
            }
          : {}),
      })

      if (res.verificationOutcome === 'sent') {
        toast({
          title: 'Pro cadastrado com sucesso!',
          description: `E-mail de boas-vindas e link de ativação enviados para ${newEmail.trim()}.`,
        })
      } else if (res.verificationOutcome === 'already_verified') {
        toast({
          title: 'Pro cadastrado com sucesso!',
          description: `E-mail de boas-vindas enviado. Pro já verificado — use "Reenviar convite" se precisar reenviar o link de acesso.`,
        })
      } else {
        // Falha no requestVerification, mas o hook do backend já disparou as boas-vindas
        toast({
          title: 'Pro cadastrado com sucesso!',
          description:
            'Pro cadastrado! E-mail de boas-vindas enviado; o link de verificação não pôde ser reenviado agora.',
        })
      }

      setCreateModalOpen(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao cadastrar Pro:', err)

      // 1. Extração estruturada de erros por campo (PocketBase: err.data.data ou err.response.data)
      const fieldData = err?.data?.data || err?.response?.data || {}
      const fieldLabels: Record<string, string> = {
        cpf: 'CPF',
        email: 'E-mail',
        name: 'Nome',
        telefone: 'Telefone',
        role: 'Perfil',
        status: 'Status',
        funcoes: 'Funções',
        periodo_teste_dias: 'Período de teste',
        ajuda_custo: 'Ajuda de custo',
        valor_negociado: 'Valor negociado',
        password: 'Senha',
        passwordConfirm: 'Confirmação de senha',
      }

      const fieldErrorParts: string[] = []
      if (typeof fieldData === 'object' && fieldData !== null) {
        for (const [field, detail] of Object.entries(fieldData)) {
          let msg = ''
          let code = ''
          if (typeof detail === 'string') {
            msg = detail
          } else if (detail && typeof detail === 'object') {
            msg = (detail as any).message || ''
            code = (detail as any).code || ''
          }

          if (field === 'email') {
            const isEmailDup =
              code === 'validation_not_unique' ||
              msg.toLowerCase().includes('unique') ||
              msg.toLowerCase().includes('duplicat') ||
              msg.toLowerCase().includes('exist') ||
              msg.toLowerCase().includes('já')
            if (isEmailDup) {
              msg = 'Este e-mail já está cadastrado na plataforma.'
            }
          }

          if (field === 'cpf') {
            const isCpfDup =
              code === 'validation_not_unique' ||
              msg.toLowerCase().includes('unique') ||
              msg.toLowerCase().includes('duplicat') ||
              msg.toLowerCase().includes('exist') ||
              msg.toLowerCase().includes('já')
            if (isCpfDup) {
              msg = 'CPF já cadastrado na plataforma.'
            }
          }

          if (msg) {
            const label = fieldLabels[field] || field
            fieldErrorParts.push(`${label}: ${msg}`)
          }
        }
      }

      // 2. Mensagens gerais do backend (err.data.message, err.response.message ou err.message)
      const generalMsg = (err?.data?.message || err?.response?.message || err?.message || '').trim()

      const generalMsgLower = generalMsg.toLowerCase()

      let errorDescription = ''

      if (fieldErrorParts.length > 0) {
        // Se houver erros específicos por campo
        errorDescription = fieldErrorParts.join('; ')
      } else if (generalMsgLower.includes('cpf')) {
        // Mensagem disparada pelo hook server-side hook_validar_cpf_pro (BadRequestError)
        errorDescription = generalMsg
      } else if (
        generalMsgLower.includes('email already') ||
        generalMsgLower.includes('e-mail já') ||
        (generalMsgLower.includes('unique') && generalMsgLower.includes('email'))
      ) {
        errorDescription = 'E-mail: Este e-mail já está cadastrado na plataforma.'
      } else if (
        generalMsg &&
        generalMsg !== 'Failed to create record.' &&
        generalMsg !== 'Something went wrong while processing your request.'
      ) {
        errorDescription = generalMsg
      } else {
        errorDescription = 'Verifique os dados informados e tente novamente.'
      }

      toast({
        title: 'Erro ao cadastrar profissional',
        description: errorDescription,
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Salvar Edição do Pro
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPro) return

    if (editCpf.trim() && !validarCPF(editCpf)) {
      toast({
        title: 'CPF inválido',
        description: 'Verifique os 11 dígitos do CPF informado.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const payload: any = {
        name: editName.trim(),
        email: editEmail.trim(),
        cpf: editCpf ? editCpf.replace(/\D/g, '') : undefined,
        telefone: editTelefone.trim(),
        funcoes: editFuncoes.length > 0 ? editFuncoes : ['Geral'],
        endereco_completo: {
          regiao: editRegiao,
          logradouro: editLogradouro,
          bairro: editBairro,
          cidade: editCidade,
          uf: editUf,
          cep: editCep,
        },
        status: editStatus,
        periodo_teste_dias: Number(editPeriodoTeste) >= 0 ? Number(editPeriodoTeste) : 0,
        documentos: editDocumentos,
      }

      // Blindagem estrita: empresa NÃO altera nem salva precificação
      if (isAdmin) {
        payload.ajuda_custo = Number(editAjudaCusto)
        payload.valor_negociado = editValorNegociado ? Number(editValorNegociado) : null
      }

      if (editStatus !== 'bloqueado') {
        payload.bloqueado_ate = null
      }

      await atualizarPro(selectedPro.id, payload)

      toast({
        title: 'Profissional atualizado com sucesso!',
        description: 'Informações cadastrais, funções e conformidade do Gate salvas.',
      })
      setEditModalOpen(false)
      loadData()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar profissional',
        description: err?.message || 'Ocorreu um erro ao salvar as alterações.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Reenviar convite / link de primeiro acesso para o pro
  const handleResendInvite = async (pro: UserRecord) => {
    setActionLoadingId(`invite-${pro.id}`)
    try {
      const outcome = await reenviarConvitePro(pro.email, pro.verified)
      const desc =
        outcome.type === 'first_access_link'
          ? `Link de primeiro acesso enviado para ${pro.email}.`
          : `Link de acesso enviado para ${pro.email}.`

      toast({
        title: 'Convite reenviado!',
        description: desc,
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao reenviar convite',
        description:
          err?.data?.data?.email?.message ||
          err?.data?.message ||
          err?.message ||
          'Tente novamente em alguns instantes.',
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  // Bloquear / Desbloquear (Exclusivo do Admin conforme regra 3)
  const handleToggleBlock = async (pro: UserRecord) => {
    if (!isAdmin) {
      toast({
        title: 'Ação restrita ao Administrador',
        description: 'O bloqueio administrativo é exclusivo da gestão geral.',
        variant: 'destructive',
      })
      return
    }

    const isCurrentlyBlocked = pro.status === 'bloqueado'
    const newStatus: UserStatus = isCurrentlyBlocked ? 'ativo' : 'bloqueado'
    const actionText = isCurrentlyBlocked ? 'desbloquear' : 'bloquear'

    if (
      !window.confirm(
        `Deseja realmente ${actionText} o profissional "${pro.name || pro.email}"?${
          !isCurrentlyBlocked ? ' Ele deixará de receber convocações de escalas.' : ''
        }`,
      )
    ) {
      return
    }

    setActionLoadingId(pro.id)
    try {
      await pb.collection('users').update(pro.id, {
        status: newStatus,
        bloqueado_ate: !isCurrentlyBlocked
          ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
          : null,
      })

      toast({
        title: isCurrentlyBlocked ? 'Profissional Desbloqueado' : 'Profissional Bloqueado',
        description: `O profissional "${pro.name || pro.email}" agora está com status ${newStatus.toUpperCase()}.`,
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: `Erro ao ${actionText} profissional`,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  // Filtragem de Pros
  const prosFiltrados = pros.filter((p) => {
    const q = searchTerm.toLowerCase().trim()
    const matchBusca =
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.cpf && p.cpf.includes(q.replace(/\D/g, ''))) ||
      (p.telefone || '').includes(q) ||
      (Array.isArray(p.funcoes) && p.funcoes.some((f) => f.toLowerCase().includes(q))) ||
      ((p.endereco_completo as any)?.regiao || '').toLowerCase().includes(q) ||
      ((p.endereco_completo as any)?.cidade || '').toLowerCase().includes(q)

    const matchStatus = filterStatus === 'todos' || p.status === filterStatus

    const matchFuncao =
      filterFuncao === 'todas' || (Array.isArray(p.funcoes) && p.funcoes.includes(filterFuncao))

    return matchBusca && matchStatus && matchFuncao
  })

  return (
    <div className="space-y-6">
      {/* Top Banner do Gate */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Gate de Documentação & Gestão de Pros
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isEmpresa
              ? 'Ambiente de RH e Operações: cadastre novos profissionais, avalie a documentação de conformidade e acompanhe o período probatório.'
              : 'Validação rigorosa de conformidade cadastral, período probatório/teste e precificação negociada por profissional.'}
          </p>
        </div>

        {/* Botão de Cadastro acessível para Empresa e Admin */}
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={openCreateModal} className="shadow-xs font-semibold">
            <UserPlus className="w-4 h-4 mr-2" />
            Cadastrar Pro
          </Button>
        </div>
      </div>

      {/* Card da Tabela de Pros com Filtros */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Base de Profissionais Cadastrados
              </CardTitle>
              <CardDescription>
                Profissionais aptos no Gate com status Ativo ou Teste podem ser convocados para
                postos e escalas.
              </CardDescription>
            </div>

            {/* Contador de resumo */}
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-primary/5 text-primary border border-primary/20 px-2.5 py-1 rounded-md font-semibold">
                Total: {pros.length}
              </span>
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold">
                Ativos: {pros.filter((p) => p.status === 'ativo').length}
              </span>
              <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-md font-semibold">
                Em Teste: {pros.filter((p) => p.status === 'teste').length}
              </span>
            </div>
          </div>

          {/* Barra de Filtros e Busca */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 mt-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail, telefone, região..."
                className="pl-9 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Filtrar por Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="ativo">Ativo (Elegível a postos)</SelectItem>
                  <SelectItem value="teste">Teste (Probatório)</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={filterFuncao} onValueChange={setFilterFuncao}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Filtrar por Função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Funções</SelectItem>
                  {funcoesCatalogo.map((f) => (
                    <SelectItem key={f.id} value={f.nome}>
                      {f.nome} {!f.ativo ? '(Inativa)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : prosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nenhum profissional encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3 px-2">Profissional / Contato</th>
                    <th className="pb-3 px-2">CPF</th>
                    <th className="pb-3 px-2">Função(ões)</th>
                    <th className="pb-3 px-2">Região</th>
                    <th className="pb-3 px-2">Status & Acesso</th>
                    <th className="pb-3 px-2">Documentos</th>
                    <th className="pb-3 px-2">Período de Teste</th>
                    {isAdmin && <th className="pb-3 px-2">Precificação</th>}
                    <th className="pb-3 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prosFiltrados.map((p) => {
                    const isAtivo = p.status === 'ativo'
                    const isTeste = p.status === 'teste'
                    const isSuspenso = p.status === 'suspenso'
                    const isBloqueado = p.status === 'bloqueado'

                    const docs = p.documentos || []
                    const docsVerificados = docs.filter(
                      (d: any) => d.status === 'verificado',
                    ).length
                    const docsRejeitados = docs.filter((d: any) => d.status === 'rejeitado').length
                    const docsPendentes = docs.filter((d: any) => d.status === 'pendente').length

                    const end = (p.endereco_completo as any) || {}
                    const regiaoTexto = end.regiao || end.bairro || end.cidade || '—'

                    const funcsList =
                      Array.isArray(p.funcoes) && p.funcoes.length > 0 ? p.funcoes : ['Geral']

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-2">
                          <div className="font-semibold text-slate-900">{p.name || 'Sem nome'}</div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{p.email}</span>
                          </div>
                          {p.telefone && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{p.telefone}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2 text-xs font-mono">
                          {p.cpf ? (
                            <span className="text-slate-800 font-medium">
                              {isAdmin ? formatarCPF(p.cpf) : mascararCPF(p.cpf)}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Não inf.</span>
                          )}
                        </td>

                        <td className="py-3 px-2">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {funcsList.map((fn, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center text-[10px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                              >
                                {fn}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3 px-2 text-xs text-slate-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[130px]" title={regiaoTexto}>
                              {regiaoTexto}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-2">
                          <div className="flex flex-col gap-1 items-start">
                            <div className="flex items-center gap-1">
                              {isAtivo && (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                  Ativo
                                </Badge>
                              )}
                              {isTeste && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                  Em Teste
                                </Badge>
                              )}
                              {isSuspenso && (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                                  Suspenso
                                </Badge>
                              )}
                              {isBloqueado && (
                                <Badge className="bg-slate-800 text-white text-[10px]">
                                  Bloqueado
                                </Badge>
                              )}
                            </div>

                            {/* Badge de Verificação de E-mail */}
                            {p.verified ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                E-mail verificado
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-medium flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                E-mail não verificado
                              </Badge>
                            )}

                            {/* Registro de Último Acesso */}
                            <div
                              className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"
                              title={
                                p.ultimo_acesso
                                  ? `Último login em ${formatDateTimeBR(p.ultimo_acesso)}`
                                  : 'Profissional ainda não acessou o sistema'
                              }
                            >
                              <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span>
                                {p.ultimo_acesso
                                  ? `Último acesso: ${formatDateTimeBR(p.ultimo_acesso)}`
                                  : 'Nunca acessou'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-2">
                          <div className="text-xs text-slate-700 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-800">
                                {docsVerificados} de {docs.length || 3}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              {docsPendentes > 0 && (
                                <span className="text-amber-600 font-medium">
                                  {docsPendentes} pendente(s)
                                </span>
                              )}
                              {docsRejeitados > 0 && (
                                <span className="text-rose-600 font-medium">
                                  {docsRejeitados} recusado(s)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-2 text-xs text-slate-600">
                          {isTeste ? (
                            <span className="text-amber-800 font-medium">
                              {p.periodo_teste_dias === 0
                                ? 'Sem teste (ativa imediata)'
                                : `${p.periodo_teste_dias || 10} dias probatórios`}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Concluído
                            </span>
                          )}
                        </td>

                        {/* Blindagem v0.0.6: Exclusivo do Admin */}
                        {isAdmin && (
                          <td className="py-3 px-2 text-xs">
                            {isTeste ? (
                              <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Ajuda Custo: {formatCurrencyBRL(p.ajuda_custo || 50)}
                              </span>
                            ) : p.valor_negociado ? (
                              <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Negociado: {formatCurrencyBRL(p.valor_negociado)}
                              </span>
                            ) : (
                              <span className="text-slate-400">Tabela do posto</span>
                            )}
                          </td>
                        )}

                        <td className="py-3 px-2 text-right space-x-1 whitespace-nowrap">
                          {/* Botão único de Reenviar Convite (link de primeiro acesso / criar senha) */}
                          <Button
                            variant="outline"
                            size="sm"
                            title={
                              !p.verified
                                ? 'Reenviar link de primeiro acesso para criação de senha'
                                : 'Reenviar link de acesso por e-mail'
                            }
                            disabled={actionLoadingId === `invite-${p.id}`}
                            className="text-slate-700 border-slate-200 hover:bg-slate-100 text-xs h-8 px-2"
                            onClick={() => handleResendInvite(p)}
                          >
                            <Mail className="w-3.5 h-3.5 mr-1 text-primary" />
                            Reenviar Convite
                          </Button>

                          {/* Bloquear / Desbloquear (Apenas Admin) */}
                          {isAdmin &&
                            (p.status === 'bloqueado' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actionLoadingId === p.id}
                                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs h-8"
                                onClick={() => handleToggleBlock(p)}
                              >
                                <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                Desbloquear
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actionLoadingId === p.id}
                                className="text-rose-700 border-rose-200 hover:bg-rose-50 text-xs h-8"
                                onClick={() => handleToggleBlock(p)}
                              >
                                <Lock className="w-3.5 h-3.5 mr-1 text-rose-600" />
                                Bloquear
                              </Button>
                            ))}

                          {/* Botão de Avaliação de Gate / Edição de Pro */}
                          <Button
                            variant="default"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => openEditModal(p)}
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" />
                            Editar & Gate
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================= MODAL DE CADASTRO DE NOVO PRO ================= */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreatePro}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary text-lg">
                <UserPlus className="w-5 h-5" />
                Cadastrar Novo Profissional (Pro)
              </DialogTitle>
              <DialogDescription>
                Adicione o profissional parceiro à base. O Pro receberá automaticamente um e-mail
                com as instruções de boas-vindas e acesso.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Informações Pessoais e Contato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nome Completo *
                  </label>
                  <Input
                    required
                    placeholder="Ex: Carlos Oliveira Santos"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    E-mail do Pro *
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="carlos.pro@exemplo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    CPF (Obrigatório e Único) *
                  </label>
                  <Input
                    required
                    placeholder="000.000.000-00"
                    value={newCpf}
                    onChange={(e) => setNewCpf(formatarCPF(e.target.value))}
                    maxLength={14}
                  />
                  {newCpf && !validarCPF(newCpf) && (
                    <span className="text-[10px] text-rose-600 block mt-0.5">
                      CPF inválido (11 dígitos verificadores)
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Telefone / WhatsApp (com DDD)
                  </label>
                  <Input
                    placeholder="(11) 98765-4321"
                    value={newTelefone}
                    onChange={(e) => setNewTelefone(e.target.value)}
                  />
                </div>
              </div>

              {/* Endereço / Localização */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  Endereço Residencial do Pro
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="Rua, Avenida, Número..."
                      className="text-xs"
                      value={newLogradouro}
                      onChange={(e) => setNewLogradouro(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Bairro"
                      className="text-xs"
                      value={newBairro}
                      onChange={(e) => setNewBairro(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Cidade"
                      className="text-xs"
                      value={newCidade}
                      onChange={(e) => setNewCidade(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="UF"
                      className="text-xs"
                      value={newUf}
                      onChange={(e) => setNewUf(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="CEP"
                      className="text-xs"
                      value={newCep}
                      onChange={(e) => setNewCep(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Seleção de Função(ões) do Catálogo */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Função(ões) de Atuação (Catálogo de Postos) *
                </label>
                <p className="text-[11px] text-slate-500">
                  Selecione uma ou mais especialidades em que o profissional está qualificado:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {funcoesCatalogo.map((f) => {
                    const isSelected = newFuncoes.includes(f.nome)
                    return (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => toggleFuncao(f.nome, true)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Briefcase className="w-3 h-3" />
                        {f.nome}
                        {isSelected && (
                          <CheckCircle2 className="w-3 h-3 text-primary-foreground/80" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Período de Teste e Precificação (Blindagem v0.0.6) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Período Probatório (Dias de Teste)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={newPeriodoTeste}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value))
                      setNewPeriodoTeste(val)
                    }}
                  />
                  <span className="text-[10px] text-slate-500">
                    {newPeriodoTeste === 0
                      ? '0 dias = sem teste, entra ativa imediatamente'
                      : 'Padrão: 10 dias probatórios (ou 0 = ativa imediata)'}
                  </span>
                </div>

                {/* Blindagem Financeira: Empresa NÃO visualiza nem edita precificação */}
                {isAdmin && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Ajuda de Custo Fixa (Teste) R$ (Admin)
                    </label>
                    <Input
                      type="number"
                      value={newAjudaCusto}
                      onChange={(e) => setNewAjudaCusto(Number(e.target.value))}
                    />
                  </div>
                )}
              </div>

              {/* Upload e Verificação Inicial de Documentos */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Documentação Obrigatória (Gate de Entrada)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Você pode anexar os arquivos enviados pelo profissional ou validar o status
                      inicial:
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {newDocumentos.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-slate-500" />
                          {doc.tipo}
                        </div>
                        {doc.arquivo_nome ? (
                          <div className="text-[11px] text-primary flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            {doc.arquivo_nome}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">Nenhum arquivo anexado</div>
                        )}
                        {doc.justificativa_recusa && (
                          <div className="text-[11px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Motivo da recusa: {doc.justificativa_recusa}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Botão de upload */}
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-700">
                            <Upload className="w-3 h-3" /> Anexar
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleDocFileUpload(idx, f, true)
                            }}
                          />
                        </label>

                        {/* Botão Aprovar */}
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'verificado' ? 'default' : 'outline'}
                          className={`h-7 px-2 text-[11px] ${
                            doc.status === 'verificado'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                          onClick={() => handleDocApprove(idx, true)}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Aprovar
                        </Button>

                        {/* Botão Recusar com Justificativa */}
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'rejeitado' ? 'destructive' : 'outline'}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => handleDocRejectInit(idx, true)}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Recusar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={isCreating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Cadastrando e Notificando...' : 'Cadastrar Profissional'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL DE EDIÇÃO & AVALIAÇÃO DE GATE ================= */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary text-lg">
                <ShieldCheck className="w-5 h-5" />
                Gate de Conformidade & Edição: {selectedPro?.name}
              </DialogTitle>
              <DialogDescription>
                Avalie os documentos obrigatórios, altere status do Gate e mantenha os dados
                cadastrais atualizados.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Painel de Ativação do Pro: Verificação de E-mail & Último Acesso */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                      Status de Ativação da Conta
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedPro?.verified ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          E-mail verificado
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          E-mail não verificado
                        </Badge>
                      )}

                      <div className="text-xs text-slate-600 flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>
                          {selectedPro?.ultimo_acesso
                            ? `Último acesso: ${formatDateTimeBR(selectedPro.ultimo_acesso)}`
                            : 'Nunca acessou'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedPro?.email && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionLoadingId === `invite-${selectedPro.id}`}
                      className="text-slate-700 border-slate-200 hover:bg-slate-100 text-xs h-8 px-2.5 shrink-0"
                      onClick={() => handleResendInvite(selectedPro)}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1 text-primary" />
                      Reenviar Convite
                    </Button>
                  )}
                </div>
              </div>

              {/* Status do Gate e Período de Teste */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Status Operacional no Gate *
                  </label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as UserStatus)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo (Elegível a convocações)</SelectItem>
                      <SelectItem value="teste">Teste (Período probatório)</SelectItem>
                      {/* Empresa não pode aplicar suspensão ou bloqueio administrativo; preserva se já estiver */}
                      <SelectItem value="suspenso" disabled={!isAdmin}>
                        Suspenso {!isAdmin ? '(Apenas Admin)' : ''}
                      </SelectItem>
                      <SelectItem value="bloqueado" disabled={!isAdmin}>
                        Bloqueado {!isAdmin ? '(Apenas Admin)' : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Dias de Teste (Probatório)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={editPeriodoTeste}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value))
                      setEditPeriodoTeste(val)
                      if (val === 0 && editStatus === 'teste') {
                        setEditStatus('ativo')
                      }
                    }}
                  />
                  <span className="text-[10px] text-slate-500">
                    {editPeriodoTeste === 0
                      ? '0 dias = sem teste, entra ativa imediatamente'
                      : 'Dias em período probatório'}
                  </span>
                </div>
              </div>

              {/* Informações Cadastrais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nome Completo *
                  </label>
                  <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    E-mail do Pro *
                  </label>
                  <Input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    CPF (Blindagem Única) *
                  </label>
                  <Input
                    placeholder="000.000.000-00"
                    value={editCpf}
                    onChange={(e) => setEditCpf(formatarCPF(e.target.value))}
                    maxLength={14}
                  />
                  {editCpf && !validarCPF(editCpf) && (
                    <span className="text-[10px] text-rose-600 block mt-0.5">CPF inválido</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Telefone / WhatsApp
                  </label>
                  <Input
                    placeholder="(11) 98765-4321"
                    value={editTelefone}
                    onChange={(e) => setEditTelefone(e.target.value)}
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  Endereço Residencial do Pro
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="Rua, Avenida, Número..."
                      className="text-xs"
                      value={editLogradouro}
                      onChange={(e) => setEditLogradouro(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Bairro"
                      className="text-xs"
                      value={editBairro}
                      onChange={(e) => setEditBairro(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Cidade"
                      className="text-xs"
                      value={editCidade}
                      onChange={(e) => setEditCidade(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="UF"
                      className="text-xs"
                      value={editUf}
                      onChange={(e) => setEditUf(e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="CEP"
                      className="text-xs"
                      value={editCep}
                      onChange={(e) => setEditCep(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Função(ões) do Catálogo */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Função(ões) de Atuação
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {funcoesCatalogo.map((f) => {
                    const isSelected = editFuncoes.includes(f.nome)
                    return (
                      <button
                        type="button"
                        key={f.id}
                        onClick={() => toggleFuncao(f.nome, false)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Briefcase className="w-3 h-3" />
                        {f.nome}
                        {isSelected && (
                          <CheckCircle2 className="w-3 h-3 text-primary-foreground/80" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Precificação Negociada — Exclusivo Admin (Blindagem v0.0.6) */}
              {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                  <div>
                    <label className="text-xs font-semibold text-amber-900 block mb-1">
                      Ajuda de Custo Fixa (Teste) R$ (Admin)
                    </label>
                    <Input
                      type="number"
                      value={editAjudaCusto}
                      onChange={(e) => setEditAjudaCusto(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-amber-900 block mb-1">
                      Valor Negociado Diária R$ (Admin)
                    </label>
                    <Input
                      type="number"
                      placeholder="Ex: 190.00"
                      value={editValorNegociado !== undefined ? editValorNegociado : ''}
                      onChange={(e) =>
                        setEditValorNegociado(e.target.value ? Number(e.target.value) : undefined)
                      }
                    />
                  </div>
                </div>
              )}

              {/* Documentação Exigida no Gate (RH Cuida) */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Documentação & Validação do Gate
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Aprovação ou recusa com justificativa
                  </span>
                </div>

                <div className="space-y-2">
                  {editDocumentos.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-slate-500" />
                          {doc.tipo}
                        </div>
                        {doc.arquivo_nome ? (
                          <div className="text-[11px] text-primary flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            {doc.arquivo_nome}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">Nenhum arquivo anexado</div>
                        )}
                        {doc.status === 'rejeitado' && doc.justificativa_recusa && (
                          <div className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <strong>Motivo da Recusa:</strong> {doc.justificativa_recusa}
                          </div>
                        )}
                        {doc.status === 'verificado' && (
                          <div className="text-[10px] text-emerald-700">
                            Aprovado e verificado no Gate
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Anexar / substituir arquivo */}
                        <label className="cursor-pointer">
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-700">
                            <Upload className="w-3 h-3" /> Anexar
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleDocFileUpload(idx, f, false)
                            }}
                          />
                        </label>

                        {/* Botão Aprovar */}
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'verificado' ? 'default' : 'outline'}
                          className={`h-7 px-2 text-[11px] ${
                            doc.status === 'verificado'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                          onClick={() => handleDocApprove(idx, false)}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Aprovar
                        </Button>

                        {/* Botão Recusar com Justificativa */}
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'rejeitado' ? 'destructive' : 'outline'}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => handleDocRejectInit(idx, false)}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Recusar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditModalOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar Gate & Dados'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL JUSTIFICATIVA DE RECUSA DE DOCUMENTO ================= */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <XCircle className="w-5 h-5" />
              Recusar Documento com Justificativa
            </DialogTitle>
            <DialogDescription>
              Explique claramente o motivo da não conformidade para orientar o profissional no
              reenvio do documento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Motivo da Recusa *
              </label>
              <Textarea
                required
                rows={3}
                placeholder="Ex: Foto ilegível, documento vencido, falta verso da certidão..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmReject}>
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
