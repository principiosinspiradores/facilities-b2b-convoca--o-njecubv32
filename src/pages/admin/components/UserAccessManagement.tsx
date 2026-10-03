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
import {
  Users,
  Shield,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle,
  Eye,
  KeyRound,
  Building2,
  Briefcase,
  AlertCircle,
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
    setModalOpen(true)
  }

  const handleOpenEdit = (user: UserRecord) => {
    setEditingUser(user)
    setName(user.name || '')
    setEmail(user.email || '')
    setCpf(user.cpf || '')
    setPassword('')
    setRole(user.role || 'pro')
    setStatus(user.status || 'ativo')
    setModalOpen(true)
  }
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      toast({
        title: 'Preencha os campos obrigatórios',
        variant: 'destructive',
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
          cpf: cpf ? cpf.replace(/\D/g, '') : undefined,
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
          })
          setIsSaving(false)
          return
        }

        await pb.collection('users').create({
          email: email.trim(),
          password: password.trim(),
          passwordConfirm: password.trim(),
          name: name.trim(),
          role,
          status,
          cpf: cpf ? cpf.replace(/\D/g, '') : undefined,
          verified: true,
        })
        toast({
          title: 'Usuário criado com sucesso',
          description: `Novo usuário ${email.trim()} adicionado com perfil ${role.toUpperCase()}.`,
        })
      }

      setModalOpen(false)
      loadUsers()
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao salvar usuário',
        description: err?.message || 'Verifique se o e-mail já não está cadastrado.',
        variant: 'destructive',
      })
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
            <Users className="w-5 h-5 text-teal-700" />
            Níveis de Acesso & Gestão de Usuários
          </CardTitle>
          <CardDescription>
            Defina o que cada perfil pode ver e operar: Admin (total e faturamento), Empresa
            (múltiplos colaboradores para gate, postos e escalas) e Pro (apenas convocações e
            repasses).
          </CardDescription>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="bg-teal-700 hover:bg-teal-800 text-white shrink-0"
        >
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
            <div className="flex items-center gap-1.5 font-bold text-teal-900">
              <Briefcase className="w-3.5 h-3.5 text-teal-600" />
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
                  ? 'bg-teal-700 text-white font-semibold'
                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
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
            <div className="w-7 h-7 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
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
                  <th className="py-2.5 px-3">Status</th>
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
                          <Badge className="bg-teal-100 text-teal-800 border-teal-200">
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
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50"
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
                  CPF (Obrigatório para Pro / Opcional para outros)
                </label>
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                />
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
                  <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
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
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : editingUser ? 'Atualizar Usuário' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
