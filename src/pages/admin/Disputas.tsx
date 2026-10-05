import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { DisputaRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { ShieldAlert, CheckCircle2, XCircle, Clock } from 'lucide-react'

export default function DisputasPage() {
  const [disputas, setDisputas] = useState<DisputaRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const loadDisputas = async () => {
    setIsLoading(true)
    try {
      const records = await pb.collection('disputas').getFullList<DisputaRecord>({
        sort: '-created',
        expand: 'payout,payout.escala,payout.escala.posto,pro',
      })
      setDisputas(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar disputas',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDisputas()

    let unsub: (() => void) | undefined
    pb.collection('disputas')
      .subscribe('*', () => {
        loadDisputas()
      })
      .then((u) => {
        unsub = u
      })
      .catch(() => {})

    return () => {
      if (unsub) unsub()
    }
  }, [])

  const handleResolver = async (
    disputa: DisputaRecord,
    resolucao: 'a_favor_pro' | 'a_favor_empresa',
  ) => {
    const textoResolucao =
      resolucao === 'a_favor_pro'
        ? 'A FAVOR DO PROFISSIONAL (Libera repasse)'
        : 'A FAVOR DA EMPRESA (Cancela repasse)'
    if (!window.confirm(`Confirma a resolução da disputa: ${textoResolucao}?`)) return

    setResolvingId(disputa.id)
    try {
      await pb.collection('disputas').update(disputa.id, {
        resolucao,
        data_resolucao: new Date().toISOString(),
      })

      toast({
        title: 'Disputa resolvida com sucesso!',
        description: `O escrow foi processado conforme a decisão: ${resolucao === 'a_favor_pro' ? 'Pago ao Pro' : 'Cancelado'}.`,
      })
      loadDisputas()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao resolver disputa',
        variant: 'destructive',
      })
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
            Mediação de Disputas & Retenções de Escrow
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Contestações registradas na janela de 24h pós-conclusão do turno. A liberação do repasse
            fica congelada até sua deliberação.
          </p>
        </div>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Ocorrências Registradas
          </CardTitle>
          <CardDescription>
            Decida soberanamente se o repasse retido deve ser transferido ao profissional ou
            cancelado em favor da empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : disputas.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              Nenhuma disputa aberta no momento.
            </div>
          ) : (
            <div className="space-y-4">
              {disputas.map((d) => {
                const payout = d.expand?.payout
                const escala = payout?.expand?.escala
                const posto = escala?.expand?.posto
                const pro = d.expand?.pro

                const isPendente = d.resolucao === 'pendente'
                const isFavorPro = d.resolucao === 'a_favor_pro'
                const isFavorEmpresa = d.resolucao === 'a_favor_empresa'

                return (
                  <div
                    key={d.id}
                    className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500 uppercase">Posto:</span>
                          <span className="font-bold text-slate-900">{posto?.nome || 'Posto'}</span>
                          <Badge
                            className={
                              isPendente
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : isFavorPro
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border-rose-200'
                            }
                          >
                            {isPendente
                              ? 'Pendente de Mediação'
                              : isFavorPro
                                ? 'Resolvido a favor do Pro'
                                : 'Resolvido a favor da Empresa'}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Profissional: <strong>{pro?.name || pro?.email}</strong> | Data de
                          Abertura: {formatDateTimeBR(d.data_abertura)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-400 uppercase font-semibold">
                          Valor em Disputa
                        </div>
                        <div className="text-xl font-black text-rose-700 tabular-nums">
                          {formatCurrencyBRL(payout?.valor)}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 text-xs text-slate-700 space-y-1">
                      <div className="font-bold text-slate-800">
                        Alegação / Motivo da Contestação:
                      </div>
                      <p className="italic text-slate-600">"{d.motivo}"</p>
                    </div>

                    {isPendente ? (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                          disabled={resolvingId === d.id}
                          onClick={() => handleResolver(d, 'a_favor_empresa')}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Decidir a Favor da Empresa (Cancelar Payout)
                        </Button>

                        <Button
                          size="sm"
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={resolvingId === d.id}
                          onClick={() => handleResolver(d, 'a_favor_pro')}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Decidir a Favor do Pro (Liberar Payout)
                        </Button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-100 text-right text-xs text-slate-400">
                        Resolvido em {formatDateTimeBR(d.data_resolucao)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
