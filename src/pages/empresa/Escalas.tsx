import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { EscalaRecord, PostoRecord, UserRecord, ConvocacaoRecord } from '@/types/facilities'
import { formatDateBR, formatCurrencyBRL } from '@/lib/formatters'
import { estimarDiariaParaData } from '@/services/pricing'
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
  Calendar,
  Plus,
  Users,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  CalendarRange,
  ArrowRight,
  ShieldCheck,
  Info,
} from 'lucide-react'

export default function EscalasPage() {
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal Nova Escala: modo "unico", "periodo" ou "recorrente"
  const [modalNovaEscala, setModalNovaEscala] = useState(false)
  const [tipoAgendamento, setTipoAgendamento] = useState<'unico' | 'periodo' | 'recorrente'>(
    'unico',
  )
  const [selectedPostoId, setSelectedPostoId] = useState('')
  const [dataEscala, setDataEscala] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState<number[]>([1, 3, 5]) // Seg, Qua, Sex padrão
  const [turnoInicio, setTurnoInicio] = useState('07:00')
  const [turnoFim, setTurnoFim] = useState('15:00')
  const [valorDiaria, setValorDiaria] = useState(180)
  const [isCreatingEscala, setIsCreatingEscala] = useState(false)
  const [modoRevisaoPeriodo, setModoRevisaoPeriodo] = useState(false)
  const [previasPeriodo, setPreviasPeriodo] = useState<
    Array<{ dataStr: string; valor: number; regra: string }>
  >([])
  const [calculandoPrevias, setCalculandoPrevias] = useState(false)

  // Modal Convocar Pros
  const [modalConvocar, setModalConvocar] = useState(false)
  const [selectedEscala, setSelectedEscala] = useState<EscalaRecord | null>(null)
  const [selectedProIds, setSelectedProIds] = useState<string[]>([])
  const [isSendingConvocacoes, setIsSendingConvocacoes] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [escalasRes, postosRes, prosRes, convocacoesRes] = await Promise.all([
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: '-data',
          expand: 'posto,posto.pro_fixo',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          filter: 'status = "ativo"',
          sort: 'nome',
          expand: 'pro_fixo',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          sort: '-created',
          expand: 'pro',
        }),
      ])

      setEscalas(escalasRes)
      setPostos(postosRes)
      setPros(prosRes)
      setConvocacoes(convocacoesRes)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados operacionais',
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

  const selectedPosto = useMemo(() => {
    return postos.find((p) => p.id === selectedPostoId)
  }, [postos, selectedPostoId])

  // Quando seleciona o posto, ajustar horário padrão de acordo com carga horária
  useEffect(() => {
    if (selectedPosto) {
      const ch = selectedPosto.carga_horaria || 8
      if (ch === 12) {
        setTurnoInicio('07:00')
        setTurnoFim('19:00')
      } else if (ch === 6) {
        setTurnoInicio('07:00')
        setTurnoFim('13:00')
      } else if (ch === 4) {
        setTurnoInicio('08:00')
        setTurnoFim('12:00')
      } else {
        setTurnoInicio('07:00')
        setTurnoFim('15:00')
      }

      // Se posto tem pro fixo mensal, valor de diária padrão é 0
      if (selectedPosto.pro_fixo && selectedPosto.tipo_remuneracao_fixa === 'mensal') {
        setValorDiaria(0)
      } else if (selectedPosto.pro_fixo && selectedPosto.tipo_remuneracao_fixa === 'por_hora') {
        const vh = selectedPosto.valor_remuneracao_fixa || 25
        setValorDiaria(vh * ch)
      } else {
        setValorDiaria(ch <= 4 ? 130 : ch <= 6 ? 160 : 180)
      }
    }
  }, [selectedPosto])

  // Toggle dia da semana (0: Domingo, 1: Segunda, ..., 6: Sábado)
  const toggleDiaSemana = (dia: number) => {
    if (diasSemanaSelecionados.includes(dia)) {
      if (diasSemanaSelecionados.length === 1) {
        toast({ title: 'Selecione pelo menos um dia da semana', variant: 'destructive' })
        return
      }
      setDiasSemanaSelecionados(diasSemanaSelecionados.filter((d) => d !== dia))
    } else {
      setDiasSemanaSelecionados([...diasSemanaSelecionados, dia].sort())
    }
  }

  // Calcular lista de dias do período (inclusive), aplicando filtro de dias da semana caso modo recorrente
  const getDatasDoPeriodo = (inicio: string, fim: string, diasPermitidos?: number[]): string[] => {
    const list: string[] = []
    if (!inicio || !fim) return list

    const [anoI, mesI, diaI] = inicio.split('-').map(Number)
    const [anoF, mesF, diaF] = fim.split('-').map(Number)

    let cur = new Date(Date.UTC(anoI, mesI - 1, diaI, 12, 0, 0))
    const end = new Date(Date.UTC(anoF, mesF - 1, diaF, 12, 0, 0))

    if (cur.getTime() > end.getTime()) return list

    while (cur.getTime() <= end.getTime()) {
      const diaSemana = cur.getUTCDay() // 0=Dom, 1=Seg...
      if (!diasPermitidos || diasPermitidos.includes(diaSemana)) {
        const y = cur.getUTCFullYear()
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
        const d = String(cur.getUTCDate()).padStart(2, '0')
        list.push(`${y}-${m}-${d}`)
      }
      cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000)
    }
    return list
  }

  // Preparar resumo do período
  const handleRevisarPeriodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostoId) {
      toast({ title: 'Selecione o posto', variant: 'destructive' })
      return
    }

    if (tipoAgendamento === 'unico') {
      if (!dataEscala) {
        toast({ title: 'Informe a data do turno', variant: 'destructive' })
        return
      }
      // Cria diretamente escala de um dia
      executarCriacaoEscalas([dataEscala])
    } else {
      // Período contínuo ou Recorrência personalizada por dias da semana
      if (!dataInicio || !dataFim) {
        toast({ title: 'Preencha as datas de início e término', variant: 'destructive' })
        return
      }

      if (tipoAgendamento === 'recorrente' && diasSemanaSelecionados.length === 0) {
        toast({ title: 'Selecione pelo menos um dia da semana', variant: 'destructive' })
        return
      }

      const diasFiltro = tipoAgendamento === 'recorrente' ? diasSemanaSelecionados : undefined
      const datas = getDatasDoPeriodo(dataInicio, dataFim, diasFiltro)

      if (datas.length === 0) {
        toast({
          title: 'Nenhuma escala gerada no período',
          description:
            tipoAgendamento === 'recorrente'
              ? 'Nenhum dos dias selecionados da semana ocorre no intervalo informado.'
              : 'A data final deve ser igual ou posterior à data inicial.',
          variant: 'destructive',
        })
        return
      }
      if (datas.length > 90) {
        toast({
          title: 'Período muito extenso',
          description: 'Crie escalas de no máximo 90 dias por vez.',
          variant: 'destructive',
        })
        return
      }

      setCalculandoPrevias(true)
      setModoRevisaoPeriodo(true)
      try {
        const postoObj = postos.find((p) => p.id === selectedPostoId)
        const carga = postoObj?.carga_horaria || 8
        const end = (postoObj?.endereco as any) || {}

        const prevs = await Promise.all(
          datas.map(async (d) => {
            // Se o posto tem profissional fixa
            if (postoObj?.pro_fixo) {
              if (postoObj.tipo_remuneracao_fixa === 'mensal') {
                return {
                  dataStr: d,
                  valor: 0,
                  regra: `fixa mensal (R$ ${(postoObj.valor_remuneracao_fixa || 0).toFixed(2)}/mês)`,
                }
              } else {
                const total = carga * (postoObj.valor_remuneracao_fixa || 25)
                return {
                  dataStr: d,
                  valor: total,
                  regra: `fixa por hora (R$ ${(postoObj.valor_remuneracao_fixa || 25).toFixed(2)}/h × ${carga}h)`,
                }
              }
            }

            // Freelancer: cálculo pelo motor de 3 camadas por dia
            const calc = await estimarDiariaParaData(
              postoObj?.id || '',
              d,
              carga,
              end.cidade,
              end.uf,
            )
            return {
              dataStr: d,
              valor: calc.valor,
              regra: calc.regra,
            }
          }),
        )

        setPreviasPeriodo(prevs)
      } catch (err) {
        console.error('Erro ao calcular prévias:', err)
      } finally {
        setCalculandoPrevias(false)
      }
    }
  }

  // Executa criação em lote (ou de uma) escala e dispara convocação nominal se posto tem fixa
  const executarCriacaoEscalas = async (datasParaCriar: string[]) => {
    if (!selectedPostoId || datasParaCriar.length === 0) return

    setIsCreatingEscala(true)
    const postoObj = postos.find((p) => p.id === selectedPostoId)
    const carga = postoObj?.carga_horaria || 8
    const end = (postoObj?.endereco as any) || {}
    const proFixoId = postoObj?.pro_fixo
    const proFixoObj = pros.find((p) => p.id === proFixoId)

    let criadas = 0
    let convsDisparadas = 0

    try {
      const nowIso = new Date().toISOString()

      for (const d of datasParaCriar) {
        // 1. Determina valor da diária para esta data
        let vDiaria = valorDiaria
        let regraCalculada = 'tabela base'

        if (proFixoId) {
          if (postoObj.tipo_remuneracao_fixa === 'mensal') {
            vDiaria = 0
            regraCalculada = `profissional fixa (mensal: R$ ${(postoObj.valor_remuneracao_fixa || 0).toFixed(2)})`
          } else {
            const vHora = postoObj.valor_remuneracao_fixa || 25
            vDiaria = vHora * carga
            regraCalculada = `profissional fixa (R$ ${vHora.toFixed(2)}/h × ${carga}h)`
          }
        } else {
          // Motor de 3 camadas para freelancers
          const c = await estimarDiariaParaData(postoObj?.id || '', d, carga, end.cidade, end.uf)
          vDiaria = c.valor
          regraCalculada = c.regra
        }

        // Criar registro na coleção 'escalas'
        // Formatar para início do dia ISO UTC
        const isoDate = new Date(`${d}T12:00:00Z`).toISOString()

        const novaEscala = await pb.collection('escalas').create<EscalaRecord>({
          posto: selectedPostoId,
          data: isoDate,
          turno_inicio: turnoInicio,
          turno_fim: turnoFim,
          status: proFixoId ? 'convocada' : 'aberta',
          multa_aplicada: false,
          valor_diaria: vDiaria,
        })
        criadas++

        // 2. Se o posto tem pro fixa, a convocação vai DIRETA e PRIORITÁRIA para ela
        if (proFixoId && proFixoObj) {
          await pb.collection('convocacoes').create({
            escala: novaEscala.id,
            pro: proFixoId,
            status: 'pendente',
            valor_diaria: vDiaria,
            regra_aplicada: regraCalculada,
            data_convocacao: nowIso,
          })
          convsDisparadas++
        }
      }

      if (datasParaCriar.length === 1) {
        toast({
          title: 'Escala criada com sucesso!',
          description: proFixoId
            ? `Convocação nominal prioritária disparada diretamente para ${proFixoObj?.name || 'a fixa do posto'}.`
            : 'Escala aberta. Agora você pode convocar profissionais elegíveis.',
        })
      } else {
        toast({
          title: `Lote criado com sucesso! (${criadas} escalas)`,
          description: proFixoId
            ? `${convsDisparadas} convocações prioritárias enviadas para ${proFixoObj?.name || 'a profissional fixa'}.`
            : `${criadas} escalas geradas com cálculo diário via motor de 3 camadas.`,
        })
      }

      setModalNovaEscala(false)
      setModoRevisaoPeriodo(false)
      setPreviasPeriodo([])
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao criar escala(s)',
        description: 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingEscala(false)
    }
  }

  const openConvocarModal = (escala: EscalaRecord) => {
    setSelectedEscala(escala)
    setSelectedProIds([])
    setModalConvocar(true)
  }

  const handleToggleProSelection = (proId: string) => {
    if (selectedProIds.includes(proId)) {
      setSelectedProIds(selectedProIds.filter((id) => id !== proId))
    } else {
      setSelectedProIds([...selectedProIds, proId])
    }
  }

  const handleSendConvocacoes = async () => {
    if (!selectedEscala || selectedProIds.length === 0) {
      toast({
        title: 'Selecione ao menos um profissional',
        variant: 'destructive',
      })
      return
    }

    setIsSendingConvocacoes(true)
    try {
      const now = new Date().toISOString()
      for (const proId of selectedProIds) {
        // Checar se já tem convocação
        const existing = convocacoes.find((c) => c.escala === selectedEscala.id && c.pro === proId)
        if (!existing) {
          const proObj = pros.find((p) => p.id === proId)
          let rule = 'tabela base'
          let val = selectedEscala.valor_diaria || 180
          if (proObj?.status === 'teste') {
            val = proObj.ajuda_custo || 50
            rule = 'ajuda de custo (teste)'
          } else if (proObj?.valor_negociado) {
            val = proObj.valor_negociado
            rule = 'valor negociado'
          }

          await pb.collection('convocacoes').create({
            escala: selectedEscala.id,
            pro: proId,
            status: 'pendente',
            valor_diaria: val,
            regra_aplicada: rule,
            data_convocacao: now,
          })
        }
      }

      // Atualiza escala para convocada
      await pb.collection('escalas').update(selectedEscala.id, {
        status: 'convocada',
      })

      toast({
        title: 'Convocações enviadas!',
        description: `${selectedProIds.length} profissional(is) receberam o alerta no inbox.`,
      })
      setModalConvocar(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao convocar profissionais',
        variant: 'destructive',
      })
    } finally {
      setIsSendingConvocacoes(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-700" />
            Escalas & Convocação Nominal
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gere os turnos por posto e dispare as convocações exclusivas para profissionais
            elegíveis.
          </p>
        </div>
        <Button
          onClick={() => setModalNovaEscala(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Gerar Nova Escala
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : escalas.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-3">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">Nenhuma escala programada</h3>
            <p className="text-sm text-slate-400">
              Clique em "Gerar Nova Escala" para abrir um turno em um posto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {escalas.map((escala) => {
            const posto = escala.expand?.posto
            const convsDestaEscala = convocacoes.filter((c) => c.escala === escala.id)
            const aceito = convsDestaEscala.find((c) => c.status === 'aceita')

            let badgeVariant = 'bg-slate-100 text-slate-800'
            if (escala.status === 'aceita') badgeVariant = 'bg-emerald-100 text-emerald-800'
            if (escala.status === 'falta') badgeVariant = 'bg-red-100 text-red-800'
            if (escala.status === 'convocada') badgeVariant = 'bg-amber-100 text-amber-800'

            const isPostoComFixa = !!posto?.pro_fixo
            const proFixoData = posto?.expand?.pro_fixo

            return (
              <Card
                key={escala.id}
                className={`border bg-white transition-shadow hover:shadow-sm ${
                  isPostoComFixa
                    ? 'border-l-4 border-l-teal-600 border-slate-200'
                    : 'border-slate-200'
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-teal-50 text-teal-800 border-teal-200 text-xs font-semibold"
                        >
                          {posto?.funcao || 'Posto'}
                        </Badge>
                        <Badge className={`${badgeVariant} text-xs uppercase tracking-wide`}>
                          Status: {escala.status}
                        </Badge>
                        {escala.multa_aplicada && (
                          <Badge className="bg-red-600 text-white text-xs">Multa Aplicada</Badge>
                        )}

                        {/* Indicação visual de Posto com Pro Fixa */}
                        {isPostoComFixa && (
                          <Badge className="bg-teal-700 text-white text-xs font-medium flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Posto c/ Profissional Fixa: {proFixoData?.name || 'Fixa vinculada'} (
                            {posto?.tipo_remuneracao_fixa === 'por_hora'
                              ? `Por Hora - ${formatCurrencyBRL(posto.valor_remuneracao_fixa || 0)}/h`
                              : `Mensalista - ${formatCurrencyBRL(posto?.valor_remuneracao_fixa || 0)}/mês`}
                            )
                          </Badge>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        {posto?.nome || 'Posto não especificado'}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-teal-600" />
                          {formatDateBR(escala.data)}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          {escala.turno_inicio} às {escala.turno_fim} ({posto?.carga_horaria || 8}h)
                        </span>
                        <span>
                          {posto?.tipo_remuneracao_fixa === 'mensal' && isPostoComFixa ? (
                            <strong className="text-teal-700">
                              Salário Mensal ({formatCurrencyBRL(posto.valor_remuneracao_fixa || 0)}
                              /mês)
                            </strong>
                          ) : (
                            <>
                              Remuneração Turno:{' '}
                              <strong className="text-slate-800">
                                {formatCurrencyBRL(escala.valor_diaria)}
                              </strong>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {aceito ? (
                        <div className="text-right bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-xs text-emerald-900">
                          <div className="font-bold flex items-center gap-1 justify-end">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Turno Coberto por:
                          </div>
                          <div className="font-semibold text-slate-900">
                            {aceito.expand?.pro?.name || 'Profissional'}
                            {isPostoComFixa && aceito.pro === posto?.pro_fixo && (
                              <span className="ml-1 text-[10px] text-teal-700 font-bold">
                                (Fixa)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => openConvocarModal(escala)}
                          className="bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs h-9"
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Convocar Profissionais ({convsDestaEscala.length})
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lista de convocados */}
                  {convsDestaEscala.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Histórico de Convocações Deste Turno</span>
                        {isPostoComFixa && (
                          <span className="text-[11px] text-teal-700 font-normal">
                            Prioridade da fixa: se recusar/faltar, reoferta automaticamente para
                            freelancers.
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {convsDestaEscala.map((c) => {
                          const isProFixoDestePosto = isPostoComFixa && c.pro === posto?.pro_fixo
                          return (
                            <div
                              key={c.id}
                              className={`flex items-center gap-2 border px-2.5 py-1 rounded text-xs ${
                                isProFixoDestePosto
                                  ? 'bg-teal-50 border-teal-300 text-teal-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-semibold">
                                {c.expand?.pro?.name || 'Pro'}
                                {isProFixoDestePosto && ' (Fixa do Posto)'}
                              </span>
                              <span className="text-slate-500">
                                {c.valor_diaria && c.valor_diaria > 0
                                  ? `(${formatCurrencyBRL(c.valor_diaria)})`
                                  : '(Fixo Mensal)'}
                              </span>
                              <Badge
                                variant="outline"
                                className={
                                  c.status === 'aceita'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : c.status === 'recusada'
                                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                                      : 'bg-amber-100 text-amber-800 border-amber-200'
                                }
                              >
                                {c.status}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nova Escala (Dia único OU Período de vários dias com resumo) */}
      <Dialog
        open={modalNovaEscala}
        onOpenChange={(open) => {
          setModalNovaEscala(open)
          if (!open) {
            setModoRevisaoPeriodo(false)
            setPreviasPeriodo([])
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {!modoRevisaoPeriodo ? (
            <form onSubmit={handleRevisarPeriodo}>
              <DialogHeader>
                <DialogTitle>Gerar Nova Escala de Trabalho</DialogTitle>
                <DialogDescription>
                  Abra turnos pontuais ou crie uma programação por período completo com cálculo
                  automático de diárias.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Seletor de Tipo: Um dia ou Intervalo de datas */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Modo de Agendamento *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoAgendamento('unico')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium flex flex-col gap-1 transition-all ${
                        tipoAgendamento === 'unico'
                          ? 'border-teal-600 bg-teal-50 text-teal-900 font-bold ring-1 ring-teal-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-teal-700" />
                        <span>Dia Único</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Turno pontual</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoAgendamento('periodo')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium flex flex-col gap-1 transition-all ${
                        tipoAgendamento === 'periodo'
                          ? 'border-teal-600 bg-teal-50 text-teal-900 font-bold ring-1 ring-teal-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <CalendarRange className="w-4 h-4 text-teal-700" />
                        <span>Por Período</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Todos os dias</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoAgendamento('recorrente')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium flex flex-col gap-1 transition-all ${
                        tipoAgendamento === 'recorrente'
                          ? 'border-teal-600 bg-teal-50 text-teal-900 font-bold ring-1 ring-teal-600'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-teal-700" />
                        <span>Recorrência</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Dias da semana</div>
                    </button>
                  </div>
                </div>

                {/* Posto de Trabalho */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Posto de Trabalho *
                  </label>
                  <Select value={selectedPostoId} onValueChange={setSelectedPostoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o posto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {postos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} ({p.funcao} - {p.carga_horaria}h)
                          {p.pro_fixo ? ' [Profissional Fixa]' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Aviso se posto tem profissional fixa */}
                {selectedPosto?.pro_fixo && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs text-teal-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-teal-800">
                      <UserCheck className="w-4 h-4 text-teal-700" />
                      Posto com Profissional Fixa Vinculada
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Profissional:{' '}
                      <strong>
                        {selectedPosto.expand?.pro_fixo?.name || 'Profissional designada'}
                      </strong>
                      . A convocação será enviada primeiro a ela. Se recusar ou faltar, o turno é
                      reofertado automaticamente aos freelancers com pagamento pelo motor de diária.
                    </p>
                    <div className="text-[11px] font-semibold text-teal-800 pt-1">
                      Remuneração da Fixa:{' '}
                      {selectedPosto.tipo_remuneracao_fixa === 'por_hora'
                        ? `${formatCurrencyBRL(selectedPosto.valor_remuneracao_fixa || 0)}/hora (Total turno: ${formatCurrencyBRL(
                            (selectedPosto.valor_remuneracao_fixa || 0) *
                              (selectedPosto.carga_horaria || 8),
                          )})`
                        : `${formatCurrencyBRL(selectedPosto.valor_remuneracao_fixa || 0)}/mês contratado (fora do escrow por diária)`}
                    </div>
                  </div>
                )}

                {/* Seleção de Datas: Única vs Período */}
                {tipoAgendamento === 'unico' ? (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Data do Turno *
                    </label>
                    <Input
                      type="date"
                      value={dataEscala}
                      onChange={(e) => setDataEscala(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Data Inicial *
                      </label>
                      <Input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Data Final *
                      </label>
                      <Input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-span-2 text-[11px] text-slate-500">
                      O sistema criará automaticamente uma escala para cada dia deste intervalo,
                      respeitando o horário e carga horária do turno.
                    </div>
                  </div>
                )}

                {/* Seleção de Dias da Semana para Recorrência Personalizada */}
                {tipoAgendamento === 'recorrente' && (
                  <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Data Inicial *
                        </label>
                        <Input
                          type="date"
                          value={dataInicio}
                          onChange={(e) => setDataInicio(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Data Final *
                        </label>
                        <Input
                          type="date"
                          value={dataFim}
                          onChange={(e) => setDataFim(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                        Dias da Semana de Atendimento *
                      </label>
                      <div className="grid grid-cols-7 gap-1">
                        {[
                          { id: 1, label: 'Seg' },
                          { id: 2, label: 'Ter' },
                          { id: 3, label: 'Qua' },
                          { id: 4, label: 'Qui' },
                          { id: 5, label: 'Sex' },
                          { id: 6, label: 'Sáb' },
                          { id: 0, label: 'Dom' },
                        ].map((d) => {
                          const isSel = diasSemanaSelecionados.includes(d.id)
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => toggleDiaSemana(d.id)}
                              className={`py-2 text-center rounded text-xs font-semibold transition-all ${
                                isSel
                                  ? 'bg-teal-700 text-white shadow-xs'
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
                        O sistema gerará escalas <strong>somente</strong> nos dias da semana
                        selecionados dentro do intervalo de datas.
                      </p>
                    </div>
                  </div>
                )}

                {/* Horários do Turno */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Início do Turno *
                    </label>
                    <Input
                      type="time"
                      value={turnoInicio}
                      onChange={(e) => setTurnoInicio(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Término do Turno *
                    </label>
                    <Input
                      type="time"
                      value={turnoFim}
                      onChange={(e) => setTurnoFim(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Valor base da diária (ou fixo do posto) */}
                {(!selectedPosto?.pro_fixo ||
                  selectedPosto.tipo_remuneracao_fixa === 'por_hora') && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Valor da Diária Base (R$)
                    </label>
                    <Input
                      type="number"
                      value={valorDiaria}
                      onChange={(e) => setValorDiaria(Number(e.target.value))}
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Para períodos, fins de semana e feriados terão o valor ajustado
                      automaticamente pelo motor de regras em 3 camadas.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalNovaEscala(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-teal-700 hover:bg-teal-800 text-white"
                  disabled={isCreatingEscala || !selectedPostoId}
                >
                  {tipoAgendamento === 'periodo' || tipoAgendamento === 'recorrente' ? (
                    <>
                      Revisar Programação <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </>
                  ) : (
                    'Salvar Escala'
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            /* Modo Revisão do Período antes de Confirmar */
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-teal-800">
                  <ShieldCheck className="w-5 h-5 text-teal-600" />
                  Resumo da Criação por Período
                </DialogTitle>
                <DialogDescription>
                  Revise o lote de escalas que será gerado e os valores calculados por dia.
                </DialogDescription>
              </DialogHeader>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3.5 text-xs text-teal-900 space-y-1.5">
                <div className="font-bold text-sm text-teal-900">
                  Serão criadas {previasPeriodo.length} escalas de {formatDateBR(dataInicio)} a{' '}
                  {formatDateBR(dataFim)}
                  {tipoAgendamento === 'recorrente' && ' nos dias selecionados'}
                </div>
                <div className="text-slate-600">
                  Posto: <strong>{selectedPosto?.nome}</strong> ({selectedPosto?.carga_horaria}
                  h/turno, {turnoInicio} às {turnoFim})
                </div>
                {tipoAgendamento === 'recorrente' && (
                  <div className="text-slate-700 font-medium">
                    Dias da semana selecionados:{' '}
                    <strong>
                      {diasSemanaSelecionados
                        .map((d) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d])
                        .join(', ')}
                    </strong>
                  </div>
                )}
                {selectedPosto?.pro_fixo && (
                  <div className="text-teal-800 font-semibold pt-1">
                    ✓ Prioridade direta: As convocações serão disparadas primeiro para a
                    profissional fixa ({selectedPosto.expand?.pro_fixo?.name}). Se ela recusar ou
                    faltar, o turno é reofertado aos freelancers.
                  </div>
                )}
              </div>

              {calculandoPrevias ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  Calculando motor de diária para cada dia do período...
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Detalhamento Dia a Dia ({previasPeriodo.length} turnos)
                  </label>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50">
                    {previasPeriodo.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white p-2 rounded border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {formatDateBR(p.dataStr)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({turnoInicio} às {turnoFim})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-teal-700">
                            {selectedPosto?.tipo_remuneracao_fixa === 'mensal' &&
                            selectedPosto.pro_fixo
                              ? 'Fixo Mensal'
                              : formatCurrencyBRL(p.valor)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">{p.regra}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModoRevisaoPeriodo(false)}
                  disabled={isCreatingEscala}
                >
                  Voltar e Ajustar
                </Button>
                <Button
                  type="button"
                  className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
                  disabled={isCreatingEscala || calculandoPrevias}
                  onClick={() => executarCriacaoEscalas(previasPeriodo.map((p) => p.dataStr))}
                >
                  {isCreatingEscala
                    ? 'Gerando escalas...'
                    : `Confirmar e Criar ${previasPeriodo.length} Escalas`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Convocar Pros Elegíveis */}
      <Dialog open={modalConvocar} onOpenChange={setModalConvocar}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convocar Profissionais Elegíveis</DialogTitle>
            <DialogDescription>
              Apenas profissionais cadastrados com documentos validados, status ativo ou teste podem
              ser convocados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-800">
                  {selectedEscala?.expand?.posto?.nome}
                </div>
                <div className="text-slate-500">
                  Data: {formatDateBR(selectedEscala?.data)} ({selectedEscala?.turno_inicio} às{' '}
                  {selectedEscala?.turno_fim})
                </div>
              </div>
              <div className="text-right">
                <span className="text-teal-700 font-bold">
                  {formatCurrencyBRL(selectedEscala?.valor_diaria)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Selecione os Profissionais ({selectedProIds.length} selecionados)
              </label>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {pros
                  .filter((p) => p.status === 'ativo' || p.status === 'teste')
                  .map((pro) => {
                    const isSelected = selectedProIds.includes(pro.id)
                    const isBlocked =
                      pro.bloqueado_ate && new Date(pro.bloqueado_ate).getTime() > Date.now()

                    return (
                      <div
                        key={pro.id}
                        onClick={() => !isBlocked && handleToggleProSelection(pro.id)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-teal-50 border-teal-500 text-teal-900'
                            : isBlocked
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isBlocked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <div>
                            <div className="font-semibold">{pro.name || pro.email}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>Status: {pro.status}</span>
                              {pro.status === 'teste' && <span>(Ajuda de Custo: R$ 50)</span>}
                              {pro.valor_negociado && (
                                <span>(Negociado: {formatCurrencyBRL(pro.valor_negociado)})</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isBlocked ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Bloqueado 24h
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Elegível
                          </Badge>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConvocar(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendConvocacoes}
              className="bg-teal-700 hover:bg-teal-800 text-white"
              disabled={isSendingConvocacoes || selectedProIds.length === 0}
            >
              {isSendingConvocacoes
                ? 'Enviando...'
                : `Disparar ${selectedProIds.length} Convocações`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
