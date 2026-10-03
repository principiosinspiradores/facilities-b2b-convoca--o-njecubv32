import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { EscalaRecord, ConvocacaoRecord } from '@/types/facilities'
import { formatDateBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Users,
  Activity,
  UserCheck,
} from 'lucide-react'

export default function CoberturaPage() {
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReoferting, setIsReoferting] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [escList, convList] = await Promise.all([
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: '-data',
          expand: 'posto,posto.pro_fixo',
        }),
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          sort: '-created',
          expand: 'pro',
        }),
      ])
      setEscalas(escList)
      setConvocacoes(convList)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar cobertura',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    let unsub: (() => void) | undefined
    pb.collection('escalas')
      .subscribe('*', () => {
        loadData()
      })
      .then((u) => {
        unsub = u
      })
      .catch(() => {})

    return () => {
      if (unsub) unsub()
    }
  }, [])

  // Marcar Falta (No-Show)
  const handleMarcarFalta = async (convocacaoId: string, escalaId: string) => {
    const confirm = window.confirm(
      'Confirmar FALTA (no-show) do profissional? Isso aplicará multa automática ao profissional e acionará reoferta imediata do turno para outros profissionais.',
    )
    if (!confirm) return

    try {
      await pb.collection('convocacoes').update(convocacaoId, {
        status: 'falta',
      })

      toast({
        title: 'No-show registrado',
        description:
          'Multa aplicada ao pro e turno reofertado automaticamente para a base elegível.',
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao registrar falta',
        variant: 'destructive',
      })
    }
  }

  // Reofertar turno manualmente
  const handleReofertarTurno = async (escala: EscalaRecord) => {
    setIsReoferting(escala.id)
    try {
      // Reabre a escala
      await pb.collection('escalas').update(escala.id, {
        status: 'aberta',
      })

      // Busca pros elegíveis ativos
      const pros = await pb.collection('users').getFullList({
        filter: 'role = "pro" && (status = "ativo" || status = "teste")',
      })

      // Convoca pros que ainda não recusaram
      let count = 0
      for (const p of pros) {
        const hasConv = convocacoes.some((c) => c.escala === escala.id && c.pro === p.id)
        if (!hasConv) {
          await pb.collection('convocacoes').create({
            escala: escala.id,
            pro: p.id,
            status: 'pendente',
            valor_diaria: escala.valor_diaria || 180,
            regra_aplicada: 'reoferta de turno (urgência de cobertura)',
            data_convocacao: new Date().toISOString(),
          })
          count++
        }
      }

      await pb.collection('escalas').update(escala.id, {
        status: 'convocada',
      })

      toast({
        title: 'Turno reofertado com sucesso!',
        description: `${count} novo(s) profissional(is) foram convocados.`,
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao reofertar turno',
        variant: 'destructive',
      })
    } finally {
      setIsReoferting(null)
    }
  }

  // Métricas de cobertura
  const totalEscalas = escalas.length
  const cobertas = escalas.filter((e) => e.status === 'aceita' || e.status === 'concluida').length
  const faltas = escalas.filter((e) => e.status === 'falta').length
  const pendentes = escalas.filter((e) => e.status === 'aberta' || e.status === 'convocada').length
  const taxaCobertura = totalEscalas > 0 ? Math.round((cobertas / totalEscalas) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-700" />
            Painel de Cobertura de Postos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Monitoramento em tempo real de comparecimento, faltas operacionais (no-show) e reoferta
            automática de turnos desguarnecidos.
          </p>
        </div>
      </div>

      {/* Gráfico Donut / Cards de Cobertura */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-teal-200 bg-teal-50/50">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
              Taxa de Cobertura
            </div>
            <div className="text-3xl font-black text-teal-900 mt-2">{taxaCobertura}%</div>
            <div className="w-full bg-teal-200 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-teal-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${taxaCobertura}%` }}
              ></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Turnos Cobertos
            </div>
            <div className="text-3xl font-black text-emerald-900 mt-2">{cobertas}</div>
            <p className="text-xs text-emerald-700/80 mt-1">Profissionais confirmados no posto</p>
          </CardContent>
        </Card>

        <Card className="border border-amber-200 bg-amber-50/50">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Turnos Pendentes
            </div>
            <div className="text-3xl font-black text-amber-900 mt-2">{pendentes}</div>
            <p className="text-xs text-amber-700/80 mt-1">Aguardando aceite de convocações</p>
          </CardContent>
        </Card>

        <Card className="border border-rose-200 bg-rose-50/50">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
              Faltas (No-Show)
            </div>
            <div className="text-3xl font-black text-rose-900 mt-2">{faltas}</div>
            <p className="text-xs text-rose-700/80 mt-1">Com aplicação de multa contratual</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista Operacional de Escalas com Ação de Cobertura */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Alocações por Posto e Turno
          </CardTitle>
          <CardDescription>
            Identifique rapidamente turnos desguarnecidos e reoferte instantaneamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : escalas.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Nenhuma escala ativa.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Posto</th>
                    <th className="pb-3">Data & Horário</th>
                    <th className="pb-3">Profissional Alocado</th>
                    <th className="pb-3">Status Cobertura</th>
                    <th className="pb-3 text-right">Ações Operacionais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {escalas.map((esc) => {
                    const posto = esc.expand?.posto
                    const convs = convocacoes.filter((c) => c.escala === esc.id)
                    const aceito = convs.find((c) => c.status === 'aceita')
                    const falta = convs.find((c) => c.status === 'falta')

                    const isPostoComFixa = !!posto?.pro_fixo
                    const proFixoData = posto?.expand?.pro_fixo

                    return (
                      <tr key={esc.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <span>{posto?.nome}</span>
                            {isPostoComFixa && (
                              <Badge className="bg-teal-100 text-teal-800 border-teal-300 text-[10px] font-medium flex items-center gap-1">
                                <UserCheck className="w-2.5 h-2.5" />
                                Posto com Fixa
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 uppercase font-medium flex items-center gap-2 mt-0.5">
                            <span>{posto?.funcao}</span>
                            {isPostoComFixa && (
                              <span className="text-[11px] text-teal-700 font-normal lowercase">
                                • fixa: <strong>{proFixoData?.name || 'Designada'}</strong> (
                                {posto?.tipo_remuneracao_fixa === 'por_hora'
                                  ? 'por hora'
                                  : 'mensal'}{' '}
                                )
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <div className="text-slate-800 font-medium">{formatDateBR(esc.data)}</div>
                          <div className="text-xs text-slate-500">
                            {esc.turno_inicio} às {esc.turno_fim} ({posto?.carga_horaria || 8}h)
                          </div>
                        </td>
                        <td className="py-3.5">
                          {aceito ? (
                            <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>{aceito.expand?.pro?.name || 'Profissional'}</span>
                              {isPostoComFixa && aceito.pro === posto?.pro_fixo && (
                                <Badge className="bg-teal-50 text-teal-800 border-teal-200 text-[10px] px-1 py-0">
                                  Fixa
                                </Badge>
                              )}
                            </span>
                          ) : falta ? (
                            <span className="font-semibold text-rose-800 flex items-center gap-1.5">
                              <XCircle className="w-4 h-4 text-rose-600" />
                              <span>{falta.expand?.pro?.name || 'Profissional'} (Faltou)</span>
                              {isPostoComFixa && falta.pro === posto?.pro_fixo && (
                                <span className="text-[10px] text-rose-600 font-bold">(Fixa)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">
                              Sem confirmação ({convs.filter((c) => c.status === 'pendente').length}{' '}
                              pendente(s))
                            </span>
                          )}
                        </td>
                        <td className="py-3.5">
                          {aceito && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              Coberto
                            </Badge>
                          )}
                          {esc.status === 'falta' && (
                            <Badge className="bg-red-100 text-red-800 border-red-200">
                              Falta (No-Show)
                            </Badge>
                          )}
                          {!aceito && esc.status !== 'falta' && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              {isPostoComFixa ? 'Aguardando Fixa' : 'Desguarnecido'}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3.5 text-right space-x-2">
                          {aceito && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                              onClick={() => handleMarcarFalta(aceito.id, esc.id)}
                            >
                              Marcar Falta (No-Show)
                            </Button>
                          )}

                          {(!aceito || esc.status === 'falta') && (
                            <Button
                              size="sm"
                              className="text-xs bg-teal-700 hover:bg-teal-800 text-white"
                              disabled={isReoferting === esc.id}
                              onClick={() => handleReofertarTurno(esc)}
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 mr-1 ${isReoferting === esc.id ? 'animate-spin' : ''}`}
                              />
                              Reofertar Turno
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
    </div>
  )
}
