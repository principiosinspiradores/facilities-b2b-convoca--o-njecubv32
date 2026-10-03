import React, { useState, useEffect } from 'react'
import { FuncaoRecord } from '@/types/facilities'
import {
  listarFuncoes,
  criarFuncao,
  atualizarFuncao,
  alternarStatusFuncao,
  contarPostosPorFuncao,
} from '@/services/funcoes'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { formatDateBR } from '@/lib/formatters'
import {
  Briefcase,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Building2,
  Search,
  PowerOff,
  Power,
  Info,
} from 'lucide-react'

export function FuncoesConfigSection() {
  const [funcoes, setFuncoes] = useState<FuncaoRecord[]>([])
  const [postosCountMap, setPostosCountMap] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [busca, setBusca] = useState('')

  // Modal Novo / Editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFuncao, setEditingFuncao] = useState<FuncaoRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form states
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)

  const carregarDados = async () => {
    setIsLoading(true)
    try {
      const lista = await listarFuncoes(false) // Carrega todas (ativas e inativas)
      setFuncoes(lista)

      // Carregar contagem de postos vinculados a cada função em paralelo
      const counts: Record<string, number> = {}
      await Promise.all(
        lista.map(async (f) => {
          counts[f.nome] = await contarPostosPorFuncao(f.nome)
        }),
      )
      setPostosCountMap(counts)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar catálogo de funções',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const handleOpenNew = () => {
    setEditingFuncao(null)
    setNome('')
    setDescricao('')
    setAtivo(true)
    setModalOpen(true)
  }

  const handleOpenEdit = (f: FuncaoRecord) => {
    setEditingFuncao(f)
    setNome(f.nome)
    setDescricao(f.descricao || '')
    setAtivo(f.ativo)
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da função.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      if (editingFuncao) {
        await atualizarFuncao(editingFuncao.id, {
          nome,
          descricao,
          ativo,
        })
        toast({
          title: 'Função atualizada',
          description: `A função "${nome}" foi atualizada com sucesso.`,
        })
      } else {
        await criarFuncao({
          nome,
          descricao,
          ativo,
        })
        toast({
          title: 'Função criada',
          description: `A função "${nome}" foi adicionada ao catálogo.`,
        })
      }
      setModalOpen(false)
      carregarDados()
    } catch (err: any) {
      console.error(err)
      const msg =
        err?.data?.data?.nome?.message || 'Verifique se já não existe uma função com este nome.'
      toast({
        title: 'Erro ao salvar função',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleAtivo = async (funcao: FuncaoRecord) => {
    const novoStatus = !funcao.ativo
    try {
      await alternarStatusFuncao(funcao.id, novoStatus)
      setFuncoes((prev) =>
        prev.map((item) => (item.id === funcao.id ? { ...item, ativo: novoStatus } : item)),
      )
      toast({
        title: novoStatus ? 'Função ativada' : 'Função desativada',
        description: novoStatus
          ? `"${funcao.nome}" agora pode ser selecionada no cadastro de postos.`
          : `"${funcao.nome}" foi removida da seleção de novos postos, mantendo o histórico dos existentes.`,
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao alterar status',
        variant: 'destructive',
      })
    }
  }

  const funcoesFiltradas = funcoes.filter((f) => {
    if (!busca.trim()) return true
    const term = busca.toLowerCase()
    return (
      f.nome.toLowerCase().includes(term) ||
      (f.descricao && f.descricao.toLowerCase().includes(term))
    )
  })

  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-teal-700" />
            Catálogo de Funções de Posto
          </CardTitle>
          <CardDescription>
            Gerencie os cargos e funções operacionais disponíveis para os postos de trabalho
            (porteiro, limpeza, zeladoria, etc.). Novas vagas surgem a todo momento e ficam
            disponíveis no cadastro de postos.
          </CardDescription>
        </div>
        <Button
          type="button"
          onClick={handleOpenNew}
          className="bg-teal-700 hover:bg-teal-800 text-white font-medium shrink-0"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Nova Função
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Barra de busca e estatísticas */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar função por nome ou descrição..."
              className="pl-9 bg-white text-xs h-9"
            />
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-4 w-full sm:w-auto justify-end">
            <span>
              Total: <strong>{funcoes.length}</strong>
            </span>
            <span className="text-emerald-700">
              Ativas: <strong>{funcoes.filter((f) => f.ativo).length}</strong>
            </span>
            <span className="text-slate-400">
              Inativas: <strong>{funcoes.filter((f) => !f.ativo).length}</strong>
            </span>
          </div>
        </div>

        {/* Informação sobre exclusão lógica */}
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            <strong>Regra de Histórico:</strong> Funções não são excluídas fisicamente quando
            desativadas para preservar a integridade dos postos, escalas e relatórios vinculados. Ao
            desativar, a função deixa de aparecer nas novas seleções, mas permanece visível nos
            registros passados.
          </div>
        </div>

        {/* Tabela de Funções */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : funcoesFiltradas.length === 0 ? (
          <div className="text-center py-10 text-slate-400 border border-dashed rounded-lg">
            <Briefcase className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Nenhuma função encontrada</p>
            <p className="text-xs text-slate-400 mt-1">
              {busca
                ? 'Tente buscar com outros termos.'
                : 'Clique em "Nova Função" para adicionar ao catálogo.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Função / Cargo</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Postos Vinculados</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Criada em</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {funcoesFiltradas.map((f) => {
                  const postosCount = postosCountMap[f.nome] || 0
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-teal-700 shrink-0" />
                        <span>{f.nome}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {f.descricao || (
                          <span className="text-slate-400 italic">Sem descrição</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {postosCount} {postosCount === 1 ? 'posto' : 'postos'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {f.ativo ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-slate-200 text-slate-600 flex items-center gap-1 w-fit"
                          >
                            <XCircle className="w-3 h-3" />
                            Inativo
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {formatDateBR(f.created)}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(f)}
                          className="h-7 px-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50"
                          title="Editar função"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAtivo(f)}
                          className={`h-7 px-2 ${
                            f.ativo
                              ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50'
                              : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                          title={f.ativo ? 'Desativar função' : 'Ativar função'}
                        >
                          {f.ativo ? (
                            <>
                              <PowerOff className="w-3.5 h-3.5 mr-1 text-amber-600" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <Power className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Ativar
                            </>
                          )}
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

      {/* Modal Criar / Editar Função */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-teal-700" />
                {editingFuncao ? 'Editar Função' : 'Nova Função no Catálogo'}
              </DialogTitle>
              <DialogDescription>
                {editingFuncao
                  ? 'Atualize os dados da função. As alterações refletirão nos postos vinculados.'
                  : 'Cadastre uma nova atribuição para ser utilizada no cadastro de postos de trabalho.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nome da Função *
                </label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Auxiliar de Limpeza, Ronda Noturno..."
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Descrição (Opcional)
                </label>
                <Textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva as principais responsabilidades ou detalhes da função..."
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="funcao-ativo-checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="funcao-ativo-checkbox"
                  className="text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Função ativa para seleção em novos postos
                </label>
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
                {isSaving
                  ? 'Salvando...'
                  : editingFuncao
                    ? 'Salvar Alterações'
                    : 'Cadastrar Função'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
