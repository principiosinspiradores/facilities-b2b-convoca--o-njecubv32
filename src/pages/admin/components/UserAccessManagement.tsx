import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { UserRecord, UserRole, UserStatus } from '@/types/facilities'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { formatarCPF, validarCPF } from '@/lib/cpf'
import { formatDateTimeBR } from '@/lib/formatters'
import { reenviarVerificacaoEmail } from '@/services/pros'
import {
  Users,
  Shield,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle,
  CheckCircle2,
  Building2,
  Briefcase,
  AlertCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Mail,
} from 'lucide-react'

export function UserAccessManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterRole, setFilterRole] = useState<'all' | UserRole>('all')

  // Modal de Criação / Edição de Usuário
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Formulário
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('pro')
  const [status, setStatus] = useState<UserStatus>('ativo')
  const [cpfError, setCpfError] = useState('')
  const [resendingId, setResendingId] = useState<string | null>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const records = await pb.collection('users').getFullList<UserRecord>({
        sort: '-created',
      })
      setUsers(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar usuários',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setName('')
    setEmail('')
    setCpf('')
    setPassword('')
    setRole('empresa')
    setStatus('ativo')
    setCpfError('')
    setModalOpen(true)
  }

  const handleOpenEdit = (user: UserRecord) => {
    setEditingUser(user)
    setName(user.name || '')
    setEmail(user.email || '')
    setCpf(user.cpf ? formatarCPF(user.cpf) : '')
    setPassword('')
    setRole(user.role || 'pro')
    setStatus(user.status || 'ativo')
    setCpfError('')
    setModalOpen(true)
  }

  const handleCpfChange = (val: string) => {
    const formatted = formatarCPF(val)
    setCpf(formatted)
    // Limpa o erro se o usuário estiver digitando
    if (cpfError) {
      const digits = formatted.replace(/\D/g, '')
      if (role === 'pro') {
        if (digits.length === 11 && validarCPF(formatted)) {
          setCpfError('')
        }
      } else {
        if (!digits || (digits.length === 11 && validarCPF(formatted))) {
          setCpfError('')
        }
      }
    }
  }

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole)
    if (cpfError) {
      const digits = cpf.replace(/\D/g, '')
      if (newRole !== 'pro' && !digits) {
        setCpfError('')
      }
    }
  }

  const handleResendUserVerification = async (user: UserRecord) => {
    setResendingId(user.id)
    try {
      await reenviarVerificacaoEmail(user.email)
      toast({
        title: 'Verificação reenviada!',
        description: `Link de ativação enviado com sucesso para ${user.email}.`,
      })
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao reenviar verificação',
        description:
          err?.data?.data?.email?.message ||
          err?.data?.message ||
          err?.message ||
          'Não foi possível enviar o e-mail de verificação.',
        variant: 'destructive',
      })
    } finally {
      setResendingId(null)
    }
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCpfError('')

    if (!name.trim() || !email.trim()) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Nome completo e e-mail são obrigatórios.',
        variant: 'destructive',
        duration: 10000,
      })
      return
    }

    const cpfDigits = cpf.replace(/\D/g, '')

    // Regra client-side de CPF:
    // a. Se role === 'pro', CPF é obrigatório
    if (role === 'pro' && !cpfDigits) {
      setCpfError('CPF é obrigatório para profissionais parceiros.')
      toast({
        title: 'CPF obrigatório',
        description: 'CPF é obrigatório para profissionais parceiros.',
        variant: 'destructive',
        duration: 10000,
      })
      return
    }

    // b. Se CPF foi preenchido (qualquer role) e for inválido, bloquear envio client-side
    if (cpfDigits && !validarCPF(cpfDigits)) {
      setCpfError('O CPF informado é inválido. Verifique os dígitos verificadores.')
      toast({
        title: 'CPF inválido',
        description: 'O CPF informado é inválido. Verifique os dígitos verificadores.',
        variant: 'destructive',
        duration: 10000,
      })
      return
    }

    setIsSaving(true)
    try {
      if (editingUser) {
        // Atualizar
        const payload: Record<string, any> = {
          name: name.trim(),
          role,
          status,
          cpf: cpfDigits || undefined,
          emailVisibility: true,
        }
        if (password.trim()) {
          payload.password = password.trim()
          payload.passwordConfirm = password.trim()
        }
        await pb.collection('users').update(editingUser.id, payload)
        toast({
          title: 'Usuário atualizado com sucesso',
          description: `Perfil ${role.toUpperCase()} e status salvos.`,
        })
      } else {
        // Criar
        if (!password.trim() || password.trim().length < 8) {
          toast({
            title: 'Senha inválida',
            description: 'A senha temporária deve conter no mínimo 8 caracteres.',
            variant: 'destructive',
            duration: 10000,
          })
          setIsSaving(false)
          return
        }

        const cleanEmail = email.trim()
        await pb.collection('users').create({
          email: cleanEmail,
          emailVisibility: true,
          password: password.trim(),
          passwordConfirm: password.trim(),
          name: name.trim(),
          role,
          status,
          cpf: cpfDigits || undefined,
        })

        // Disparo tolerante do e-mail de verificação para o novo usuário
        let emailSent = true
        try {
          await pb.collection('users').requestVerification(cleanEmail)
        } catch (mailErr) {
          console.warn('Falha ao enviar e-mail de verificação:', mailErr)
          emailSent = false
        }

        toast({
          title: 'Usuário criado com sucesso',
          description: emailSent
            ? `Novo usuário ${cleanEmail} adicionado com perfil ${role.toUpperCase()} (e-mail de verificação enviado).`
            : `Novo usuário ${cleanEmail} adicionado com perfil ${role.toUpperCase()}, mas o e-mail de verificação não pôde ser enviado.`,
        })
      }

      setModalOpen(false)
      loadUsers()
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err)

      // 1. Extração estruturada de erros por campo (PocketBase: err.data.data ou err.response.data)
      const fieldData = err?.data?.data || err?.response?.data || {}
      const fieldLabels: Record<string, string> = {
        cpf: 'CPF',
        email: 'E-mail',
        name: 'Nome',
        role: 'Perfil',
        status: 'Status',
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
            setCpfError(msg)
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
        setCpfError(generalMsg)
      } else if (
        generalMsgLower.includes('email already') ||
        generalMsgLower.includes('e-mail já') ||
        (generalMsgLower.includes('unique') && generalMsgLower.includes('email'))
      ) {
        errorDescription = 'E-mail: Este e-mail já está cadastrado na plataforma.'
      } else if (
        generalMsg &&
        generalMsg !== 'Failed to create record.' &&
        generalMsg !== 'Failed to update record.' &&
        generalMsg !== 'Something went wrong while processing your request.'
      ) {
        errorDescription = generalMsg
      } else {
        errorDescription = 'Verifique os dados informados e tente novamente.'
      }

      toast({
        title: editingUser ? 'Erro ao atualizar usuário' : 'Erro ao cadastrar usuário',
        description: errorDescription,
        variant: 'destructive',
        duration: 10000,
      })
      // O modal permanece aberto preservando todos os campos digitados
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteUser = async (user: UserRecord) => {
    if (user.id === currentUser?.id) {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode excluir seu próprio usuário logado.',
        variant: 'destructive',
      })
      return
    }

    if (
      !confirm(
        `Deseja realmente remover o usuário "${user.name || user.email}"? Esta ação é irreversível.`,
      )
    ) {
      return
    }

    try {
      await pb.collection('users').delete(user.id)
      toast({
        title: 'Usuário removido',
      })
      loadUsers()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao remover usuário',
        variant: 'destructive',
      })
    }
  }

  const filteredUsers = users.filter((u) => {
    if (filterRole === 'all') return true
    return u.role === filterRole
  })

  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Níveis de Acesso & Gestão de Usuários
          </CardTitle>
          <CardDescription>
            Defina o que cada perfil pode ver e operar: Admin (total e faturamento), Empresa
            (múltiplos colaboradores para gate, postos e escalas) e Pro (apenas convocações e
            repasses).
          </CardDescription>
        </div>
        <Button onClick={handleOpenCreate} size="sm" className="shrink-0">
          <UserPlus className="w-4 h-4 mr-1.5" />
          Novo Usuário
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Matriz explicativa de permissões */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-purple-900">
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              ADMINISTRADOR
            </div>
            <p className="text-slate-600 leading-relaxed">
              Acesso total: gerencia todos os usuários, regras de preço, white-label, aprovação de
              contas Pix, mediação de disputas e cancelamentos.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-blue-900">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              EMPRESA (MÚLTIPLOS USUÁRIOS)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Gestão operacional compartilhada (RH, supervisão e operações): aprova cadastro/gate de
              pros, bloqueia/desbloqueia, cria postos, escalas e cobertura. Sem acesso a
              faturamento.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Briefcase className="w-3.5 h-3.5 text-primary" />
              PROFISSIONAL (PRO)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Apenas telas próprias: aceita/recusa convocações, visualiza escalas confirmadas,
              cadastra chave Pix e consulta repasses em escrow.
            </p>
          </div>
        </div>

        {/* Filtros rápidos de visualização */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-medium">Filtrar perfil:</span>
            <button
              onClick={() => setFilterRole('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterRole === 'all'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos ({users.length})
            </button>
            <button
              onClick={() => setFilterRole('admin')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterRole === 'admin'
                  ? 'bg-purple-700 text-white font-semibold'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              }`}
            >
              Admin ({users.filter((u) => u.role === 'admin').length})
            </button>
            <button
              onClick={() => setFilterRole('empresa')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterRole === 'empresa'
                  ? 'bg-blue-700 text-white font-semibold'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Empresa ({users.filter((u) => u.role === 'empresa').length})
            </button>
            <button
              onClick={() => setFilterRole('pro')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterRole === 'pro'
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'bg-primary/5 text-primary hover:bg-primary/10'
              }`}
            >
              Pro ({users.filter((u) => u.role === 'pro').length})
            </button>
          </div>

          <span className="text-xs text-slate-400">
            {filteredUsers.length} usuário(s) listado(s)
          </span>
        </div>

        {/* Tabela de Usuários */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            Nenhum usuário encontrado para este perfil.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Nome / E-mail</th>
                  <th className="py-2.5 px-3">Perfil (Role)</th>
                  <th className="py-2.5 px-3">Status & Ativação</th>
                  <th className="py-2.5 px-3">Último Acesso</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{u.name || 'Sem nome'}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {u.role === 'admin' && (
                          <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                            Admin
                          </Badge>
                        )}
                        {u.role === 'empresa' && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                            Empresa
                          </Badge>
                        )}
                        {u.role === 'pro' && (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            Profissional (Pro)
                          </Badge>
                        )}
                        {!u.role && (
                          <Badge variant="outline" className="text-slate-500">
                            Não definido
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <div>
                            {u.status === 'ativo' && (
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                                <CheckCircle className="w-3 h-3" /> Ativo
                              </span>
                            )}
                            {u.status === 'teste' && (
                              <span className="inline-flex items-center gap-1 font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                                Teste
                              </span>
                            )}
                            {u.status === 'suspenso' && (
                              <span className="inline-flex items-center gap-1 font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                                Suspenso
                              </span>
                            )}
                            {u.status === 'bloqueado' && (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-200 px-2 py-0.5 rounded text-[11px]">
                                Bloqueado
                              </span>
                            )}
                          </div>

                          {/* Badge E-mail verificado / não verificado */}
                          {u.verified ? (
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
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-[11px] text-slate-600 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {u.ultimo_acesso ? formatDateTimeBR(u.ultimo_acesso) : 'Nunca acessou'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        {!u.verified && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={resendingId === u.id}
                            className="h-7 px-2 text-amber-700 border-amber-300 bg-amber-50/50 hover:bg-amber-100 text-[11px]"
                            onClick={() => handleResendUserVerification(u)}
                            title="Reenviar e-mail de ativação e verificação"
                          >
                            <RefreshCw
                              className={`w-3 h-3 mr-1 text-amber-600 ${
                                resendingId === u.id ? 'animate-spin' : ''
                              }`}
                            />
                            Reenviar verificação
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-600 hover:text-primary hover:bg-primary/5"
                          onClick={() => handleOpenEdit(u)}
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDeleteUser(u)}
                          disabled={u.id === currentUser?.id}
                          title={
                            u.id === currentUser?.id
                              ? 'Você não pode excluir sua própria conta'
                              : 'Excluir usuário'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Dialog Criação / Edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveUser}>
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Editar Usuário & Permissões' : 'Criar Novo Usuário'}
              </DialogTitle>
              <DialogDescription>
                {editingUser
                  ? `Alterando perfil e credenciais de ${editingUser.email}`
                  : 'Defina as credenciais, nível de acesso e status operacional.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nome Completo / Razão Social *
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Carlos Silva ou Construtora Alfa"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">E-mail *</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@dominio.com.br"
                  required
                  disabled={!!editingUser}
                />
                {editingUser && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    O e-mail não pode ser alterado diretamente por esta tela de parâmetros.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  CPF {role === 'pro' ? '*' : '(Opcional)'}
                </label>
                <Input
                  value={cpf}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className={cpfError ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
                />
                {cpfError ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {cpfError}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {role === 'pro'
                      ? 'Obrigatório para profissionais parceiros.'
                      : 'Opcional para perfil Empresa e Administrador.'}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {editingUser
                    ? 'Nova Senha (deixe em branco para não alterar)'
                    : 'Senha Inicial *'}
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    editingUser ? 'Mínimo 8 caracteres' : 'Mínimo 8 caracteres (Skip@Pass)'
                  }
                  required={!editingUser}
                  minLength={8}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nível de Acesso (Role) *
                  </label>
                  <Select value={role} onValueChange={(v) => handleRoleChange(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin (Total)</SelectItem>
                      <SelectItem value="empresa">Empresa (Colaborador / RH / Gestão)</SelectItem>
                      <SelectItem value="pro">Pro (Profissional)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Status Operacional *
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="teste">Teste</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : editingUser ? 'Atualizar Usuário' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
