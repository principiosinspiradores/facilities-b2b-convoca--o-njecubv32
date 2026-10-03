import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { ContaPixRecord, SettingsRecord, UserRecord } from '@/types/facilities'
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
  CreditCard,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building,
  Lock,
  RefreshCw,
  Search,
} from 'lucide-react'

interface PaymentConfigProps {
  settings: SettingsRecord | null
  payoutProvider: 'mercadopago' | 'pix_manual' | 'outro'
  setPayoutProvider: (p: 'mercadopago' | 'pix_manual' | 'outro') => void
  empresaPixChave: string
  setEmpresaPixChave: (v: string) => void
  empresaPixTipo: string
  setEmpresaPixTipo: (v: string) => void
  empresaTitular: string
  setEmpresaTitular: (v: string) => void
  empresaMpClientId: string
  setEmpresaMpClientId: (v: string) => void
}

export function PaymentConfigSection({
  settings,
  payoutProvider,
  setPayoutProvider,
  empresaPixChave,
  setEmpresaPixChave,
  empresaPixTipo,
  setEmpresaPixTipo,
  empresaTitular,
  setEmpresaTitular,
  empresaMpClientId,
  setEmpresaMpClientId,
}: PaymentConfigProps) {
  const [contasPix, setContasPix] = useState<ContaPixRecord[]>([])
  const [isLoadingContas, setIsLoadingContas] = useState(true)
  const [filterValidacao, setFilterValidacao] = useState<'all' | 'liberadas' | 'pendentes'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal de validação/liberação individual
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedConta, setSelectedConta] = useState<ContaPixRecord | null>(null)
  const [observacao, setObservacao] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const loadContasPix = async () => {
    setIsLoadingContas(true)
    try {
      const records = await pb.collection('conta_pix').getFullList<ContaPixRecord>({
        expand: 'pro',
        sort: '-created',
      })
      setContasPix(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar contas de profissionais',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingContas(false)
    }
  }

  useEffect(() => {
    loadContasPix()
  }, [])

  const handleOpenValidar = (conta: ContaPixRecord) => {
    setSelectedConta(conta)
    setObservacao(conta.observacao_validacao || '')
    setModalOpen(true)
  }

  const handleToggleLiberacao = async (liberar: boolean) => {
    if (!selectedConta) return
    setIsUpdating(true)
    try {
      const now = new Date().toISOString()
      await pb.collection('conta_pix').update(selectedConta.id, {
        liberada: liberar,
        data_liberacao: liberar ? now : null,
        observacao_validacao:
          observacao.trim() ||
          (liberar
            ? 'Conta validada e liberada pelo administrador.'
            : 'Conta bloqueada/retida pelo administrador.'),
      })

      toast({
        title: liberar ? 'Conta Pix Liberada!' : 'Conta Pix Retida/Bloqueada',
        description: liberar
          ? 'O profissional está apto a receber repasses automáticos pelo cron de escrow.'
          : 'Repasses a este profissional ficarão retidos até nova aprovação.',
      })

      setModalOpen(false)
      loadContasPix()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar status da conta',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const filteredContas = contasPix.filter((c) => {
    if (filterValidacao === 'liberadas' && !c.liberada) return false
    if (filterValidacao === 'pendentes' && c.liberada) return false
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase()
      const proName = c.expand?.pro?.name?.toLowerCase() || ''
      const proEmail = c.expand?.pro?.email?.toLowerCase() || ''
      const chave = c.chave?.toLowerCase() || ''
      if (!proName.includes(s) && !proEmail.includes(s) && !chave.includes(s)) {
        return false
      }
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* 1. Conta da Empresa Pagadora (Origem) */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-5 h-5 text-teal-700" />
            Conta de Pagamento da Empresa (Origem dos Repasses)
          </CardTitle>
          <CardDescription>
            Defina a conta Pix e credenciais do Mercado Pago que operam os pagamentos automáticos de
            diárias aos profissionais terceirizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Provedor de Payout Automático *
              </label>
              <Select value={payoutProvider} onValueChange={(v) => setPayoutProvider(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mercadopago">Mercado Pago Pix (Recomendado)</SelectItem>
                  <SelectItem value="pix_manual">Pix Direto / Remessa Bancária</SelectItem>
                  <SelectItem value="outro">Outro Gateway Especializado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Tipo da Chave Pix da Empresa
              </label>
              <Select value={empresaPixTipo} onValueChange={setEmpresaPixTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="aleatoria">Chave Aleatória (EVP)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Chave Pix da Empresa *
              </label>
              <Input
                value={empresaPixChave}
                onChange={(e) => setEmpresaPixChave(e.target.value)}
                placeholder="00.000.000/0001-00 ou financeiro@..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Razão Social do Titular / Empresa Pagadora
              </label>
              <Input
                value={empresaTitular}
                onChange={(e) => setEmpresaTitular(e.target.value)}
                placeholder="Facilities Pro Pagamentos Ltda"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Identificador / Public Key (Mercado Pago)
              </label>
              <Input
                value={empresaMpClientId}
                onChange={(e) => setEmpresaMpClientId(e.target.value)}
                placeholder="APP_USR-xxxxxxxxx"
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Credencial de integração para conciliação contábil do escrow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Gate de Liberação de Contas Pix dos Profissionais (Destino) */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-700" />
              Gate de Contas Pix dos Pros (Validação Obrigatória de Repasse)
            </CardTitle>
            <CardDescription>
              Cada profissional precisa ter sua conta de destino validada e liberada antes de entrar
              no fluxo de repasse automático.{' '}
              <strong>Pros sem conta liberada não recebem repasse</strong> (o valor permanece retido
              em segurança).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadContasPix}
            className="shrink-0 text-slate-600"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Recarregar Contas
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Alerta de Regra de Negócio */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Regra Crítica do Cron de Escrow:</span> O cron de
              liberação de pagamentos verifica a flag <code>liberada = true</code> na conta Pix de
              cada profissional. Se a conta não estiver validada/liberada pela administração, o
              repasse é pulado e permanece em status <em>retido</em> com o evento contábil{' '}
              <code>retencao_conta_pendente</code> registrado.
            </div>
          </div>

          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Filtrar:</span>
              <button
                type="button"
                onClick={() => setFilterValidacao('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterValidacao === 'all'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todas ({contasPix.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterValidacao('liberadas')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterValidacao === 'liberadas'
                    ? 'bg-emerald-700 text-white font-semibold'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Liberadas ({contasPix.filter((c) => c.liberada).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterValidacao('pendentes')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterValidacao === 'pendentes'
                    ? 'bg-amber-700 text-white font-semibold'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Pendentes de Liberação ({contasPix.filter((c) => !c.liberada).length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
              <Input
                placeholder="Buscar pro ou chave..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
          </div>

          {/* Tabela de Contas */}
          {isLoadingContas ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredContas.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Nenhuma conta Pix cadastrada ou correspondente ao filtro.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Profissional</th>
                    <th className="py-2.5 px-3">Tipo / Chave Pix</th>
                    <th className="py-2.5 px-3">Provedor / Ref</th>
                    <th className="py-2.5 px-3">Status de Repasse</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredContas.map((c) => {
                    const pro = c.expand?.pro
                    const isLiberada = !!c.liberada

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">
                            {pro?.name || 'Profissional ID: ' + c.pro.slice(0, 8)}
                          </div>
                          <div className="text-slate-400 font-mono text-[11px]">{pro?.email}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {c.chave}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1.5 uppercase">
                            ({c.tipo_chave})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div>{c.provedor_conta || 'Mercado Pago'}</div>
                          {c.conta_referencia && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                              {c.conta_referencia}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {isLiberada ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              Liberada p/ Repasse
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3 h-3" />
                              Retida (Pendente)
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-2.5 text-xs font-medium ${
                              isLiberada
                                ? 'text-amber-700 hover:text-amber-900 hover:bg-amber-50'
                                : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50'
                            }`}
                            onClick={() => handleOpenValidar(c)}
                          >
                            {isLiberada ? 'Suspender Liberação' : 'Validar & Liberar'}
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

      {/* Dialog de Validação / Liberação */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedConta?.liberada
                ? 'Suspender Liberação de Conta'
                : 'Validar e Liberar Conta Pix'}
            </DialogTitle>
            <DialogDescription>
              {selectedConta?.expand?.pro?.name
                ? `Profissional: ${selectedConta.expand.pro.name} (${selectedConta.expand.pro.email})`
                : 'Defina se esta conta de destino está apta a receber pagamentos automáticos do escrow.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Chave Pix:</span>
                <span className="font-mono font-bold text-slate-800">{selectedConta?.chave}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tipo:</span>
                <span className="uppercase text-slate-700 font-semibold">
                  {selectedConta?.tipo_chave}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Provedor:</span>
                <span className="text-slate-700">
                  {selectedConta?.provedor_conta || 'Mercado Pago'}
                </span>
              </div>
              {selectedConta?.data_liberacao && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Última Liberação:</span>
                  <span className="text-slate-700">
                    {new Date(selectedConta.data_liberacao).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Parecer de Auditoria / Observação
              </label>
              <Input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Documento de titularidade conferido e aprovado."
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Fechar
            </Button>
            {selectedConta?.liberada ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isUpdating}
                onClick={() => handleToggleLiberacao(false)}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                {isUpdating ? 'Processando...' : 'Bloquear / Reter Repasses'}
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isUpdating}
                onClick={() => handleToggleLiberacao(true)}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {isUpdating ? 'Processando...' : 'Liberar para Repasse Automático'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
