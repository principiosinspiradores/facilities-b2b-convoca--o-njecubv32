import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ConvocacaoRecord, AtestadoRecord, SettingsRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR, getDataHojeSP } from '@/lib/formatters'
import { listarAtestadosPorPro } from '@/services/atestados'
import { ModalEnviarAtestado } from '@/components/atestados/ModalEnviarAtestado'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import {
  Calendar,
  Clock,
  MapPin,
  Ban,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Filter,
} from 'lucide-react'
import { Link } from 'react-router-dom'

type FiltroPeriodoEscala = 'hoje' | '7dias' | 'todos'

// Helper SP: calcula data de hoje + N dias no formato YYYY-MM-DD (fuso America/Sao_Paulo)
function getDataOffsetSP(diasOffset: number): string {
  const nowSP = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  const d = new Date(nowSP)
  d.setDate(d.getDate() + diasOffset)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export default function MinhasEscalasPage() {
  const { user } = useAuth()
  const [escalas, setEscalas] = useState<ConvocacaoRecord[]>([])
  const [atestadosPro, setAtestadosPro] = useState<AtestadoRecord[]>([])
  const [prazoAtestadoHoras, setPrazoAtestadoHoras] = useState<number>(48)
  const [settingsData, setSettingsData] = useState<SettingsRecord | null>(null)
  const [selectedConvAtestado, setSelectedConvAtestado] = useState<ConvocacaoRecord | null>(null)
  const [isModalAtestadoOpen, setIsModalAtestadoOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodoEscala>('hoje')
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [confirmandoPresencaId, setConfirmandoPresencaId] = useState<string | null>(null)
  const [recusandoPresencaId, setRecusandoPresencaId] = useState<string | null>(null)
  const [dialogNaoVaiOpen, setDialogNaoVaiOpen] = useState(false)
  const [convNaoVaiSelected, setConvNaoVaiSelected] = useState<ConvocacaoRecord | null>(null)

  const loadData = async (silencioso = false) => {
    if (!user) return
    if (!silencioso) {
      setIsLoading(true)
    }
    try {
      const [records, atestadosList, settingsList] = await Promise.all([
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          filter: `pro = "${user.id}" && (status = "aceita" || status = "falta" || status = "coberta" || status = "cancelada")`,
          sort: '-data_convocacao',
          expand: 'escala,escala.posto',
        }),
        listarAtestadosPorPro(user.id).catch(() => []),
        pb
          .collection('settings')
          .getFullList<SettingsRecord>({ sort: '-created', batch: 1 })
          .catch(() => []),
      ])

      if (settingsList && settingsList.length > 0) {
        setSettingsData(settingsList[0])
        setPrazoAtestadoHoras(Number(settingsList[0].prazo_atestado_horas) || 48)
      }
      setAtestadosPro(atestadosList)

      // Ordenar em memória pela data do turno crescente (mais próximo primeiro), desempate por turno_inicio crescente
      const recordsOrdenados = [...records].sort((a, b) => {
        const dataA = a.expand?.escala?.data
        const dataB = b.expand?.escala?.data
        if (!dataA && !dataB) return 0
        if (!dataA) return 1
        if (!dataB) return -1
        if (dataA !== dataB) {
          return dataA.localeCompare(dataB)
        }
        const horaA = a.expand?.escala?.turno_inicio || ''
        const horaB = b.expand?.escala?.turno_inicio || ''
        return horaA.localeCompare(horaB)
      })

      setEscalas(recordsOrdenados)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar escalas',
        description: 'Tente recarregar a página.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const calcularHorasAteTurno = (conv: ConvocacaoRecord) => {
    const escala = conv.expand?.escala
    if (!escala?.data) return 999
    const dataStr = escala.data.slice(0, 10)
    const horaIni = (escala.turno_inicio || '08:00').trim()
    const parts = horaIni.split(':')
    const hh = (parts[0] || '08').padStart(2, '0')
    const mm = (parts[1] || '00').padStart(2, '0')
    const inicioMs = Date.parse(`${dataStr}T${hh}:${mm}:00-03:00`)
    const diffMs = inicioMs - Date.now()
    return diffMs / (3600 * 1000)
  }

  const isTurnoHoje = (conv: ConvocacaoRecord) => {
    const escala = conv.expand?.escala
    if (!escala?.data) return false
    const dataStr = escala.data.slice(0, 10)
    return dataStr === getDataHojeSP()
  }

  // Filtragem de período mantendo a ordenação crescente existente
  const hojeStr = getDataHojeSP()
  const limite7DiasStr = getDataOffsetSP(6) // hoje + 6 dias = 7 dias

  const escalasFiltradas = escalas.filter((conv) => {
    const dataTurno = conv.expand?.escala?.data?.slice(0, 10) || ''
    if (filtroPeriodo === 'hoje') {
      return dataTurno === hojeStr
    }
    if (filtroPeriodo === '7dias') {
      return dataTurno >= hojeStr && dataTurno <= limite7DiasStr
    }
    // 'todos': exatamente a listagem de hoje em diante como está (crescente), sem mudar ordem; turnos passados seguem visíveis nessa opção
    return true
  })

  const handleConfirmarPresenca = async (conv: ConvocacaoRecord) => {
    setConfirmandoPresencaId(conv.id)
    // Atualização otimista imediata no estado local
    setEscalas((prev) =>
      prev.map((item) =>
        item.id === conv.id ? { ...item, confirmacao_presenca: 'confirmada' as const } : item,
      ),
    )
    try {
      await pb.send(`/backend/v1/facilities/confirmar-presenca/${conv.id}`, {
        method: 'POST',
      })
      toast({
        title: 'Presença confirmada!',
        description: 'Sua confirmação de presença no turno foi registrada com sucesso.',
        className: 'bg-emerald-600 text-white border-emerald-700',
      })
      // Recarga em segundo plano silenciosa (sem spinner de tela inteira)
      loadData(true)
    } catch (err: any) {
      console.error('Erro ao confirmar presença:', err)
      // Rollback em caso de falha
      setEscalas((prev) =>
        prev.map((item) =>
          item.id === conv.id ? { ...item, confirmacao_presenca: conv.confirmacao_presenca } : item,
        ),
      )
      const errorMsg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Não foi possível confirmar a presença.'
      toast({
        title: 'Erro ao confirmar presença',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setConfirmandoPresencaId(null)
    }
  }

  const handleDispararNaoVouHoje = async () => {
    if (!convNaoVaiSelected) return
    const convId = convNaoVaiSelected.id
    const estadoAnteriorPresenca = convNaoVaiSelected.confirmacao_presenca
    setRecusandoPresencaId(convId)
    // Atualização otimista imediata no estado local
    setEscalas((prev) =>
      prev.map((item) =>
        item.id === convId ? { ...item, confirmacao_presenca: 'nao_vai' as const } : item,
      ),
    )
    try {
      const res: any = await pb.send(`/backend/v1/facilities/recusar-presenca-hoje/${convId}`, {
        method: 'POST',
      })
      toast({
        title: 'Aviso registrado',
        description: `Informado que não comparecerá. Convocação emergencial disparada automaticamente (${res?.total_convocadas ?? 0} profissionais notificadas).`,
        variant: 'destructive',
      })
      setDialogNaoVaiOpen(false)
      setConvNaoVaiSelected(null)
      // Recarga em segundo plano silenciosa (sem spinner de tela inteira)
      loadData(true)
    } catch (err: any) {
      console.error('Erro ao registrar não vou hoje:', err)
      // Rollback em caso de erro
      setEscalas((prev) =>
        prev.map((item) =>
          item.id === convId ? { ...item, confirmacao_presenca: estadoAnteriorPresenca } : item,
        ),
      )
      const errorMsg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Não foi possível registrar o aviso.'
      toast({
        title: 'Erro ao registrar',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setRecusandoPresencaId(null)
    }
  }

  const handleCancelarTurno = async (conv: ConvocacaoRecord) => {
    const horasRestantes = calcularHorasAteTurno(conv)
    const horasTrava = settingsData?.horas_trava_cancelamento ?? 6
    const horasMulta = settingsData?.horas_multa_cancelamento ?? 12
    const valorMulta12h = settingsData?.multa_cancelamento_12h ?? 50
    const horasBloqueio = settingsData?.horas_bloqueio_cancelamento ?? 24

    if (horasRestantes < horasTrava) {
      toast({
        title: 'Cancelamento bloqueado',
        description: `Cancelamento bloqueado: menos de ${horasTrava}h para o início do turno. Fale com a gestão se necessário.`,
        variant: 'destructive',
      })
      return
    }

    let mensagemConfirmacao = `Atenção: o cancelamento de um turno previamente aceito reabrirá a vaga e aplicará um bloqueio preventivo de ${horasBloqueio} horas no seu perfil.`

    if (horasRestantes < horasMulta) {
      mensagemConfirmacao += `\n\nATENÇÃO: Como faltam menos de ${horasMulta}h para o início do turno, será aplicada uma multa rescisória por cancelamento tardio no valor de ${formatCurrencyBRL(valorMulta12h)}.`
    }

    mensagemConfirmacao += '\n\nDeseja realmente prosseguir com o cancelamento?'

    const confirm = window.confirm(mensagemConfirmacao)
    if (!confirm) return

    setCancelingId(conv.id)
    try {
      await pb.collection('convocacoes').update(conv.id, {
        status: 'cancelada',
      })

      toast({
        title: 'Turno cancelado',
        description: 'A escala foi reaberta e a política operacional foi acionada.',
        variant: 'destructive',
      })
      loadData()
    } catch (err: any) {
      console.error(err)
      const errorMsg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Não foi possível cancelar.'
      toast({
        title: 'Erro ao cancelar turno',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setCancelingId(null)
    }
  }

  const calcularStatusPrazoAtestado = (conv: ConvocacaoRecord) => {
    const escala = conv.expand?.escala
    if (!escala?.data) return { dentroDoPrazo: true, horasRestantes: prazoAtestadoHoras }

    const dataStr = escala.data.slice(0, 10)
    const horaFim = escala.turno_fim || '18:00'
    const fimTurno = new Date(`${dataStr}T${horaFim.length === 5 ? horaFim + ':00' : horaFim}`)
    const agora = new Date()

    const limiteMs = fimTurno.getTime() + prazoAtestadoHoras * 3600 * 1000
    const diffMs = limiteMs - agora.getTime()
    const horasRestantes = Math.ceil(diffMs / (3600 * 1000))

    return {
      dentroDoPrazo: diffMs > 0,
      horasRestantes: Math.max(0, horasRestantes),
    }
  }

  return (
    <div className="space-y-6">
      <ModalEnviarAtestado
        open={isModalAtestadoOpen}
        onOpenChange={setIsModalAtestadoOpen}
        convocacao={selectedConvAtestado}
        proId={user?.id || ''}
        onSuccess={() => {
          loadData()
        }}
      />

      {/* Dialog de Confirmação 'Não vou hoje' */}
      {dialogNaoVaiOpen && convNaoVaiSelected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Não vou hoje</h3>
                <p className="text-xs text-slate-500">Confirmação de ausência no turno</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 space-y-2">
              <p className="font-semibold text-rose-950">
                O posto buscará outra profissional imediatamente.
              </p>
              <p>
                Ao confirmar que não comparecerá ao turno de hoje (
                <strong>{convNaoVaiSelected.expand?.escala?.turno_inicio}</strong> no{' '}
                <strong>{convNaoVaiSelected.expand?.escala?.expand?.posto?.nome}</strong>), uma
                convocação emergencial será disparada em tempo real para as profissionais elegíveis.
              </p>
              <p className="text-[11px] text-rose-800 font-medium">
                Sua escala aceita não é cancelada nem é aplicada multa neste momento — a gestão
                recebe o alerta imediatamente para providenciar a substituição.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDialogNaoVaiOpen(false)
                  setConvNaoVaiSelected(null)
                }}
                disabled={recusandoPresencaId === convNaoVaiSelected.id}
              >
                Voltar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="font-semibold"
                disabled={recusandoPresencaId === convNaoVaiSelected.id}
                onClick={handleDispararNaoVouHoje}
              >
                {recusandoPresencaId === convNaoVaiSelected.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Disparando emergencial...
                  </span>
                ) : (
                  'Confirmar que não vou'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Postos / Minhas Escalas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe suas alocações confirmadas, turnos realizados e o andamento das diárias.
          </p>
        </div>
      </div>

      {/* Barra de Filtros: Hoje (padrão) / Próximos 7 dias / Todos */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-primary" /> Período:
        </span>
        {[
          { id: 'hoje', label: 'Hoje' },
          { id: '7dias', label: 'Próximos 7 dias' },
          { id: 'todos', label: 'Todos' },
        ].map((p) => {
          const isSelected = filtroPeriodo === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFiltroPeriodo(p.id as FiltroPeriodoEscala)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Destaque no topo para a opção "Hoje" */}
      {filtroPeriodo === 'hoje' && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-slate-900">Hoje — {formatDateBR(hojeStr)}</span>
          </div>
          <span className="text-xs font-semibold text-primary">
            {escalasFiltradas.length} {escalasFiltradas.length === 1 ? 'turno hoje' : 'turnos hoje'}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : escalasFiltradas.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-2">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">
              {filtroPeriodo === 'hoje'
                ? 'Nenhum turno programado para hoje'
                : filtroPeriodo === '7dias'
                  ? 'Nenhum turno nos próximos 7 dias'
                  : 'Nenhuma escala programada'}
            </h3>
            <p className="text-sm text-slate-400">
              {filtroPeriodo === 'hoje'
                ? 'Você não possui turnos agendados para hoje. Selecione "Próximos 7 dias" ou "Todos" para ver suas outras datas.'
                : 'Quando você aceita convocações na sua caixa de entrada, seus turnos aparecem aqui.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {escalasFiltradas.map((conv) => {
            const escala = conv.expand?.escala
            const posto = escala?.expand?.posto
            const end = posto?.endereco as any

            let badgeVariant = 'bg-emerald-100 text-emerald-800 border-emerald-200'
            let statusLabel = 'Confirmado / Agendado'

            if (conv.status === 'cancelada') {
              badgeVariant = 'bg-rose-100 text-rose-800 border-rose-200'
              statusLabel = 'Cancelado'
            } else if (conv.status === 'falta') {
              badgeVariant = 'bg-red-100 text-red-900 border-red-300'
              statusLabel = 'Falta (No-show)'
            } else if (conv.status === 'coberta') {
              badgeVariant = 'bg-blue-100 text-blue-800 border-blue-200'
              statusLabel = 'Coberto por Substituto'
            }

            return (
              <Card
                key={conv.id}
                className="border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/5 px-2 py-0.5 rounded">
                      {posto?.funcao || 'Operacional'}
                    </span>
                    <Badge variant="outline" className={`${badgeVariant} text-xs font-medium`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900 mt-2">
                    {posto?.nome || 'Posto'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-slate-400 font-medium uppercase text-[10px]">
                        Data do Turno
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {formatDateBR(escala?.data)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-medium uppercase text-[10px]">
                        Horário
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {escala?.turno_inicio} às {escala?.turno_fim}
                      </div>
                    </div>
                  </div>

                  {end && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {end.logradouro}, {end.numero} - {end.bairro}, {end.cidade}/{end.uf}
                      </span>
                    </div>
                  )}

                  {/* Destaque Confirmação de Presença (pré-ponto) para turnos de hoje aceitos */}
                  {conv.status === 'aceita' && isTurnoHoje(conv) && (
                    <div className="border rounded-xl p-3.5 transition-all bg-gradient-to-r from-slate-50 to-emerald-50/30 border-slate-200">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold text-slate-800">
                            Turno hoje às {escala?.turno_inicio}
                          </span>
                        </div>
                        {conv.confirmacao_presenca === 'confirmada' && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs font-semibold gap-1 py-1 px-2.5 shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Presença confirmada ✓
                          </Badge>
                        )}
                        {conv.confirmacao_presenca === 'nao_vai' && (
                          <Badge className="bg-rose-600 hover:bg-rose-600 text-white text-xs font-semibold gap-1 py-1 px-2.5 shadow-xs">
                            <Ban className="w-3.5 h-3.5" />
                            Disse que NÃO vai
                          </Badge>
                        )}
                        {(!conv.confirmacao_presenca ||
                          conv.confirmacao_presenca === 'nao_confirmada') && (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-800 border-amber-300 text-[11px] font-semibold"
                          >
                            Aguardando confirmação
                          </Badge>
                        )}
                      </div>

                      {conv.confirmacao_presenca === 'confirmada' ? (
                        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            Sua ida está confirmada para a gestão!
                          </span>
                          <span className="text-[11px] text-emerald-700">
                            Ponto obrigatório no posto
                          </span>
                        </div>
                      ) : conv.confirmacao_presenca === 'nao_vai' ? (
                        <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2">
                          <span className="font-semibold">Ausência informada.</span> Convocação
                          emergencial de substituição acionada automaticamente para o posto.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-600">
                            Por favor, confirme se você comparecerá ao posto no horário combinado:
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              disabled={confirmandoPresencaId === conv.id}
                              onClick={() => handleConfirmarPresenca(conv)}
                            >
                              {confirmandoPresencaId === conv.id ? (
                                <span className="flex items-center gap-1">
                                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Confirmando...
                                </span>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                  Confirmar presença
                                </>
                              )}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs font-semibold border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              onClick={() => {
                                setConvNaoVaiSelected(conv)
                                setDialogNaoVaiOpen(true)
                              }}
                            >
                              <Ban className="w-3.5 h-3.5 mr-1 text-rose-600" />
                              Não vou hoje
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    {(() => {
                      const isFixaDoPosto = posto?.pro_fixo === user?.id
                      const forma = posto?.forma_de_contratacao || posto?.tipo_remuneracao_fixa
                      const isMensalista =
                        isFixaDoPosto && (forma === 'mensalista' || forma === 'mensal')
                      const isHorista =
                        isFixaDoPosto && (forma === 'horista' || forma === 'por_hora')

                      if (isMensalista) {
                        return (
                          <div>
                            <div className="text-xs text-slate-400">Tipo de Contrato</div>
                            <Badge className="bg-primary/10 text-primary border border-primary/20 text-xs font-semibold mt-1">
                              Contrato Mensal Fixo — Remuneração Salarial
                            </Badge>
                          </div>
                        )
                      }

                      if (isHorista) {
                        return (
                          <div>
                            <div className="text-xs text-slate-400">Tipo de Contrato</div>
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold mt-1">
                              Contrato Horista
                            </Badge>
                          </div>
                        )
                      }

                      return (
                        <div>
                          <div className="text-xs text-slate-400">Valor da diária</div>
                          <div className="text-base font-bold text-primary">
                            {formatCurrencyBRL(conv.valor_diaria)}
                          </div>
                        </div>
                      )
                    })()}

                    {conv.status === 'aceita' &&
                      (() => {
                        const horasRestantes = calcularHorasAteTurno(conv)
                        const horasTrava = settingsData?.horas_trava_cancelamento ?? 6
                        const bloqueadoTrava = horasRestantes < horasTrava

                        return (
                          <div className="flex items-center gap-2">
                            <Link to="/ponto-pro">
                              <Button size="sm" className="text-xs font-medium">
                                <Clock className="w-3.5 h-3.5 mr-1 text-primary-foreground" />
                                Bater Ponto
                              </Button>
                            </Link>
                            {bloqueadoTrava ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-slate-400 bg-slate-100 hover:bg-slate-100 cursor-not-allowed"
                                disabled
                                title="Cancelamento bloqueado — menos de 6h para o turno. Fale com a gestão se necessário."
                              >
                                <Ban className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                Cancelamento bloqueado (&lt;{horasTrava}h)
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                disabled={cancelingId === conv.id}
                                onClick={() => handleCancelarTurno(conv)}
                              >
                                <Ban className="w-3.5 h-3.5 mr-1" />
                                Cancelar presença
                              </Button>
                            )}
                          </div>
                        )
                      })()}
                  </div>

                  {/* Bloco de atestado para convocações marcadas com falta */}
                  {conv.status === 'falta' &&
                    (() => {
                      const atestadoExistente = atestadosPro.find((a) => a.convocacao === conv.id)
                      const { dentroDoPrazo, horasRestantes } = calcularStatusPrazoAtestado(conv)

                      if (atestadoExistente) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 flex items-center justify-between gap-2 mt-2">
                            <div className="flex items-center gap-1.5 font-medium">
                              <FileText className="w-4 h-4 text-amber-700 shrink-0" />
                              <span>
                                Atestado:{' '}
                                <strong className="uppercase">
                                  {atestadoExistente.status_validacao}
                                </strong>
                              </span>
                            </div>
                            <Badge
                              className={
                                atestadoExistente.status_validacao === 'aprovado'
                                  ? 'bg-emerald-600 text-white'
                                  : atestadoExistente.status_validacao === 'rejeitado'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-600 text-white'
                              }
                            >
                              {atestadoExistente.status_validacao === 'aprovado'
                                ? 'Abonado'
                                : atestadoExistente.status_validacao === 'rejeitado'
                                  ? 'Rejeitado'
                                  : 'Em análise'}
                            </Badge>
                          </div>
                        )
                      }

                      return (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 space-y-2 mt-2">
                          <div className="flex items-center justify-between text-xs text-rose-900 font-medium">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              Falta registrada ao turno
                            </span>
                            {dentroDoPrazo ? (
                              <span className="text-[11px] text-primary bg-primary/5 border border-primary/20 px-1.5 py-0.5 rounded font-semibold">
                                Prazo: {horasRestantes}h restantes
                              </span>
                            ) : (
                              <span className="text-[11px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-semibold">
                                Prazo encerrado ({prazoAtestadoHoras}h)
                              </span>
                            )}
                          </div>

                          <Button
                            size="sm"
                            disabled={!dentroDoPrazo}
                            onClick={() => {
                              setSelectedConvAtestado(conv)
                              setIsModalAtestadoOpen(true)
                            }}
                            className={`w-full text-xs font-semibold ${
                              dentroDoPrazo ? '' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            {dentroDoPrazo
                              ? 'Enviar Atestado Médico'
                              : `Prazo encerrado (${prazoAtestadoHoras}h pós-turno)`}
                          </Button>
                        </div>
                      )
                    })()}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
