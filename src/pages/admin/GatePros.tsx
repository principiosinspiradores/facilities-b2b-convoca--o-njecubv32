import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { UserRecord, UserStatus } from '@/types/facilities'
import { formatCurrencyBRL } from '@/lib/formatters'
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
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  Edit,
} from 'lucide-react'

export default function GateProsPage() {
  const [pros, setPros] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal de edição / aprovação
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPro, setSelectedPro] = useState<UserRecord | null>(null)
  const [status, setStatus] = useState<UserStatus>('ativo')
  const [periodoTesteDias, setPeriodoTesteDias] = useState(10)
  const [ajudaCusto, setAjudaCusto] = useState(50)
  const [valorNegociado, setValorNegociado] = useState<number | undefined>(undefined)
  const [documentos, setDocumentos] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const loadPros = async () => {
    setIsLoading(true)
    try {
      const records = await pb.collection('users').getFullList<UserRecord>({
        filter: 'role = "pro"',
        sort: '-created',
      })
      setPros(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar base de profissionais',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPros()
  }, [])

  const openEditModal = (pro: UserRecord) => {
    setSelectedPro(pro)
    setStatus(pro.status || 'ativo')
    setPeriodoTesteDias(pro.periodo_teste_dias || 10)
    setAjudaCusto(pro.ajuda_custo || 50)
    setValorNegociado(pro.valor_negociado)
    setDocumentos(
      pro.documentos || [
        { tipo: 'RG / CPF', status: 'pendente' },
        { tipo: 'Comprovante Residência', status: 'pendente' },
        { tipo: 'Certidão Negativa', status: 'pendente' },
      ],
    )
    setModalOpen(true)
  }

  const handleDocStatusChange = (
    index: number,
    newStatus: 'pendente' | 'verificado' | 'rejeitado',
  ) => {
    const updated = [...documentos]
    updated[index].status = newStatus
    setDocumentos(updated)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPro) return

    setIsSaving(true)
    try {
      await pb.collection('users').update(selectedPro.id, {
        status,
        periodo_teste_dias: Number(periodoTesteDias),
        ajuda_custo: Number(ajudaCusto),
        valor_negociado: valorNegociado ? Number(valorNegociado) : null,
        documentos,
      })

      toast({
        title: 'Cadastro do profissional atualizado!',
        description: 'Status de conformidade e gate salvos.',
      })
      setModalOpen(false)
      loadPros()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-700" />
            Gate de Documentação & Gestão de Pros
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Validação rigorosa de conformidade cadastral, período probatório/teste e precificação
            negociada por profissional.
          </p>
        </div>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Profissionais Cadastrados
          </CardTitle>
          <CardDescription>
            Apenas profissionais com gate verificado e status Ativo/Teste ficam elegíveis para
            chamadas de postos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : pros.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Nenhum profissional cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Nome / E-mail</th>
                    <th className="pb-3">Status Gate</th>
                    <th className="pb-3">Documentos</th>
                    <th className="pb-3">Período de Teste</th>
                    <th className="pb-3">Precificação Especial</th>
                    <th className="pb-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pros.map((p) => {
                    const isAtivo = p.status === 'ativo'
                    const isTeste = p.status === 'teste'
                    const isSuspenso = p.status === 'suspenso'

                    const docs = p.documentos || []
                    const docsVerificados = docs.filter(
                      (d: any) => d.status === 'verificado',
                    ).length

                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3.5">
                          <div className="font-semibold text-slate-900">{p.name || 'Sem nome'}</div>
                          <div className="text-xs text-slate-400 font-mono">{p.email}</div>
                        </td>
                        <td className="py-3.5">
                          {isAtivo && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              Ativo
                            </Badge>
                          )}
                          {isTeste && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              Teste
                            </Badge>
                          )}
                          {isSuspenso && (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                              Suspenso
                            </Badge>
                          )}
                          {p.status === 'bloqueado' && (
                            <Badge className="bg-slate-800 text-white">Bloqueado</Badge>
                          )}
                        </td>
                        <td className="py-3.5">
                          <div className="text-xs text-slate-600 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {docsVerificados} de {docs.length || 3} validados
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 text-xs text-slate-600">
                          {isTeste ? `${p.periodo_teste_dias || 10} dias probatórios` : 'Concluído'}
                        </td>
                        <td className="py-3.5 text-xs">
                          {isTeste ? (
                            <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                              Ajuda de Custo: {formatCurrencyBRL(p.ajuda_custo || 50)}
                            </span>
                          ) : p.valor_negociado ? (
                            <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                              Negociado: {formatCurrencyBRL(p.valor_negociado)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Tabela padrão do posto</span>
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-teal-700 hover:text-teal-900 hover:bg-teal-50 text-xs"
                            onClick={() => openEditModal(p)}
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" />
                            Avaliar Gate
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

      {/* Modal Avaliação Gate & Documentos */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>Gate de Conformidade: {selectedPro?.name}</DialogTitle>
              <DialogDescription>
                Revise os documentos obrigatórios, defina o status do profissional e regras de
                remuneração direta.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Status Operacional *
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo (Elegível a postos)</SelectItem>
                      <SelectItem value="teste">Teste (Ajuda de custo)</SelectItem>
                      <SelectItem value="suspenso">Suspenso (Reincidência cancelamento)</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado Administrativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Dias de Teste (Probatório)
                  </label>
                  <Input
                    type="number"
                    value={periodoTesteDias}
                    onChange={(e) => setPeriodoTesteDias(Number(e.target.value))}
                    min={1}
                    max={90}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Ajuda de Custo Fixa (Teste) R$
                  </label>
                  <Input
                    type="number"
                    value={ajudaCusto}
                    onChange={(e) => setAjudaCusto(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Valor Negociado Diária (Opcional) R$
                  </label>
                  <Input
                    type="number"
                    value={valorNegociado || ''}
                    onChange={(e) =>
                      setValorNegociado(e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="Ex: 190.00"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Documentação Exigida (Gate de Entrada)
                </h4>
                <div className="space-y-2">
                  {documentos.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="font-medium text-slate-800">{doc.tipo}</div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'verificado' ? 'default' : 'outline'}
                          className={`h-7 px-2 text-[11px] ${
                            doc.status === 'verificado'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : ''
                          }`}
                          onClick={() => handleDocStatusChange(idx, 'verificado')}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={doc.status === 'rejeitado' ? 'destructive' : 'outline'}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => handleDocStatusChange(idx, 'rejeitado')}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  ))}
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
                {isSaving ? 'Salvando...' : 'Atualizar Gate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
