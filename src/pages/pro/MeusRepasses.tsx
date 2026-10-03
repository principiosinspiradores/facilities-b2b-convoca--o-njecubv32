import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { PayoutRecord, DisputaRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import {
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  Clock,
  HelpCircle,
  ArrowUpRight,
} from 'lucide-react'

export default function MeusRepassesPage() {
  const { user } = useAuth()
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal de abertura de disputa
  const [disputeModalOpen, setDisputeModalOpen] = useState(false)
  const [selectedPayout, setSelectedPayout] = useState<PayoutRecord | null>(null)
  const [motivoDisputa, setMotivoDisputa] = useState('')
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false)

  const loadPayouts = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const records = await pb.collection('payouts').getFullList<PayoutRecord>({
        filter: `pro = "${user.id}"`,
        sort: '-created',
        expand: 'escala,escala.posto',
      })
      setPayouts(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar repasses',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPayouts()
  }, [user])

  const handleOpenDispute = (payout: PayoutRecord) => {
    setSelectedPayout(payout)
    setMotivoDisputa('')
    setDisputeModalOpen(true)
  }

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPayout || !user || !motivoDisputa.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o motivo detalhado da contestação.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmittingDispute(true)
    try {
      await pb.collection('disputas').create({
        payout: selectedPayout.id,
        pro: user.id,
        motivo: motivoDisputa.trim(),
        resolucao: 'pendente',
        data_abertura: new Date().toISOString(),
      })

      toast({
        title: 'Disputa aberta com sucesso',
        description: 'O repasse foi retido para mediação pelo administrador da plataforma.',
      })
      setDisputeModalOpen(false)
      loadPayouts()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao registrar disputa',
        description: 'Verifique se a janela de 24h pós-conclusão é válida.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmittingDispute(false)
    }
  }

  const totalRetido = payouts
    .filter((p) => p.status === 'retido')
    .reduce((acc, p) => acc + (p.valor || 0), 0)
  const totalPago = payouts
    .filter((p) => p.status === 'pago')
    .reduce((acc, p) => acc + (p.valor || 0), 0)
  const totalDisputa = payouts
    .filter((p) => p.status === 'disputa')
    .reduce((acc, p) => acc + (p.valor || 0), 0)

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Repasses (Escrow Lógico)</h1>
          <p className="text-slate-500 text-sm mt-1">
            Transparência contábil de ponta a ponta: do aceite à liquidação na sua chave Pix.
          </p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Em Garantia (Retido)
              </span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-900 mt-2 tabular-nums">
              {formatCurrencyBRL(totalRetido)}
            </div>
            <p className="text-xs text-amber-700/80 mt-1">
              Liberado automaticamente após período de carência
            </p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Total Repassado
              </span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-900 mt-2 tabular-nums">
              {formatCurrencyBRL(totalPago)}
            </div>
            <p className="text-xs text-emerald-700/80 mt-1">
              Valores já liquidados para sua conta Pix
            </p>
          </CardContent>
        </Card>

        <Card className="border border-rose-200 bg-rose-50/50">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
                Em Disputa
              </span>
              <ShieldAlert className="w-5 h-5 text-rose-600" />
            </div>
            <div className="text-2xl font-black text-rose-900 mt-2 tabular-nums">
              {formatCurrencyBRL(totalDisputa)}
            </div>
            <p className="text-xs text-rose-700/80 mt-1">
              Sob análise da administração da plataforma
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Repasses */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Histórico de Diárias e Payouts
          </CardTitle>
          <CardDescription>
            Linha do tempo contábil de cada turno executado ou provisionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <DollarSign className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">Nenhum registro de repasse gerado ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Posto de Trabalho</th>
                    <th className="pb-3">Data do Turno</th>
                    <th className="pb-3">Valor</th>
                    <th className="pb-3">Status do Escrow</th>
                    <th className="pb-3">Liberação Estimada</th>
                    <th className="pb-3">Ref. Provedor</th>
                    <th className="pb-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.map((pay) => {
                    const posto = pay.expand?.escala?.expand?.posto
                    const isRetido = pay.status === 'retido'
                    const isPago = pay.status === 'pago'
                    const isDisputa = pay.status === 'disputa'

                    return (
                      <tr key={pay.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 font-medium text-slate-800">
                          {posto?.nome || 'Posto Desconhecido'}
                        </td>
                        <td className="py-3.5 text-slate-600">
                          {formatDateBR(pay.expand?.escala?.data)}
                        </td>
                        <td className="py-3.5 font-bold text-teal-800 tabular-nums">
                          {formatCurrencyBRL(pay.valor)}
                        </td>
                        <td className="py-3.5">
                          {isRetido && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Retido (Garantia)
                            </span>
                          )}
                          {isPago && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Pago (Liberado)
                            </span>
                          )}
                          {isDisputa && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-900">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                              Em Disputa
                            </span>
                          )}
                          {pay.status === 'cancelado' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                              Cancelado
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-slate-600 text-xs">
                          {formatDateBR(pay.data_liberacao)}
                        </td>
                        <td className="py-3.5 text-slate-500 text-xs font-mono">
                          {pay.referencia ||
                            `${pay.provedor || 'mercadopago'}#${pay.id.slice(0, 6)}`}
                        </td>
                        <td className="py-3.5 text-right">
                          {isRetido && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                              onClick={() => handleOpenDispute(pay)}
                            >
                              Contestar
                            </Button>
                          )}
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

      {/* Modal de Disputa */}
      <Dialog open={disputeModalOpen} onOpenChange={setDisputeModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmitDispute}>
            <DialogHeader>
              <DialogTitle className="text-rose-700 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                Abrir Contestação / Disputa
              </DialogTitle>
              <DialogDescription>
                Se houver divergência quanto à execução das atividades, horas cumpridas ou diária,
                registre sua justificativa para mediação pelo administrador.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                <div>
                  <strong className="text-slate-700">Posto:</strong>{' '}
                  {selectedPayout?.expand?.escala?.expand?.posto?.nome}
                </div>
                <div>
                  <strong className="text-slate-700">Valor do Repasse:</strong>{' '}
                  {formatCurrencyBRL(selectedPayout?.valor)}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Motivo da Contestação *
                </label>
                <Textarea
                  value={motivoDisputa}
                  onChange={(e) => setMotivoDisputa(e.target.value)}
                  placeholder="Descreva o ocorrido (ex: extensão de jornada sem adicional, divergência de posto, etc.)"
                  rows={4}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisputeModalOpen(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmittingDispute}>
                {isSubmittingDispute ? 'Registrando...' : 'Confirmar e Travar Escrow'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
