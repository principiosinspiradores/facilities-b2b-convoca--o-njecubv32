import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  EscalaRecord,
  ConvocacaoRecord,
  PostoRecord,
  UserRecord,
  PontoRecord,
  ItemAlertaCobertura,
  TipoAlertaCobertura,
  HistoricoEscalaRecord,
} from '@/types/facilities'
import { formatDateBR, formatCurrencyBRL } from '@/lib/formatters'
import {
  detectarAlertasCobertura,
  executarConvocacaoManual,
  listarHistoricoDaEscala,
} from '@/services/cobertura'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
  Activity,
  AlertTriangle,
  AlertOctagon,
  Clock,
  UserX,
  UserCheck,
  Send,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  MapPin,
  MessageSquare,
  History,
  Info,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export default function CoberturaPage() {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const isAdmin = role === 'admin'

  // Estados dos dados brutos
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [alertasSemConvocacao, setAlertasSemConvocacao] = useState<PontoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Atualização em tempo real do relógio (para cronômetros de tempo aberto)
  const [nowDate, setNowDate] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => {
      setNowDate(new Date())
    }, 30000) // a cada 30 segundos
    return () => clearInterval(timer)
  }, [])

  // Filtros
  const [filtroPosto, setFiltroPosto] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<'hoje' | '7dias' | 'custom' | 'todos'>('todos')
  const [filtroTipoAlerta, setFiltroTipoAlerta] = useState<string>('todos')
  const [dataInicioCustom, setDataInicioCustom] = useState<string>('')
  const [dataFimCustom, setDataFimCustom] = useState<string>('')
  const [buscaTexto, setBuscaTexto] = useState<string>('')

  // Modal Convocação Manual
  const [modalConvocacaoOpen, setModalConvocacaoOpen] = useState(false)
  const [alertaSelecionado, setAlertaSelecionado] = useState<ItemAlertaCobertura | null>(null)
  const [modoEnvio, setModoEnvio] = useState<'todos' | 'especifico'>('todos')
  const [proIdsSelecionados, setProIdsSelecionados] = useState<string[]>([])
  const [isSendingConvocacao, setIsSendingConvocacao] = useState(false)

  // Modal Histórico da Escala
  const [modalHistoricoOpen, setModalHistoricoOpen] = useState(false)
  const [escalaHistorico, setEscalaHistorico] = useState<EscalaRecord | null>(null)
  const [historicoItens, setHistoricoItens] = useState<HistoricoEscalaRecord[]>([])
  const [isLoadingHistorico, setIsLoadingHistorico] = useState(false)

  // Carregamento de dados
  const loadData = useCallback(async () => {
    try {
      const [escList, convList, postosList, prosList, pontosAlertas] = await Promise.all([
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: 'data,turno_inicio',
          expand: 'posto,posto.pro_fixo',
        }),
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          sort: '-created',
          expand: 'pro,escala',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          sort: 'nome',
          expand: 'pro_fixo',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
        pb
          .collection('pontos')
          .getFullList<PontoRecord>({
            filter: 'aviso_sem_convocacao = true',
            sort: '-timestamp_real',
            expand: 'pro,posto,escala.posto',
          })
          .catch(() => []),
      ])
      setEscalas(escList)
      setConvocacoes(convList)
      setPostos(postosList)
      setPros(prosList)
      setAlertasSemConvocacao(pontosAlertas)
    } catch (err) {
      console.error('Erro ao carregar dados de cobertura:', err)
      toast({
        title: 'Erro ao sincronizar dados do painel',
        description: 'Verifique sua conexão e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // Realtime subscriptions
    let unsubEscalas: (() => void) | undefined
    let unsubConvocacoes: (() => void) | undefined
    let unsubHistorico: (() => void) | undefined

    pb.collection('escalas')
      .subscribe('*', () => loadData())
      .then((u) => {
        unsubEscalas = u
      })
      .catch(() => {})

    pb.collection('convocacoes')
      .subscribe('*', () => loadData())
      .then((u) => {
        unsubConvocacoes = u
      })
      .catch(() => {})

    pb.collection('historico_escalas')
      .subscribe('*', () => loadData())
      .then((u) => {
        unsubHistorico = u
      })
      .catch(() => {})

    return () => {
      if (unsubEscalas) unsubEscalas()
      if (unsubConvocacoes) unsubConvocacoes()
      if (unsubHistorico) unsubHistorico()
    }
  }, [loadData])

  // Calcular alertas brutos detectados
  const todosAlertas = useMemo(() => {
    return detectarAlertasCobertura(escalas, convocacoes, pros, nowDate, postos)
  }, [escalas, convocacoes, pros, nowDate, postos])

  // Contadores para os Cards no Topo (4 tipos)
  const contadores = useMemo(() => {
    const postosDescobertos = todosAlertas.filter((a) => a.tipoAlerta === 'posto_descoberto').length
    const faltasPendentes = todosAlertas.filter((a) => a.tipoAlerta === 'falta_pendente').length
    const reofertasEsgotadas = todosAlertas.filter(
      (a) => a.tipoAlerta === 'reoferta_esgotada',
    ).length
    const recusasFixa = todosAlertas.filter((a) => a.tipoAlerta === 'recusa_fixa').length
    const totalGeral = todosAlertas.length

    return {
      postosDescobertos,
      faltasPendentes,
      reofertasEsgotadas,
      recusasFixa,
      totalGeral,
    }
  }, [todosAlertas])

  // Filtragem dos alertas
  const alertasFiltrados = useMemo(() => {
    const hojeStr = nowDate.toISOString().slice(0, 10)
    const em7Dias = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    const em7DiasStr = em7Dias.toISOString().slice(0, 10)

    return todosAlertas.filter((item) => {
      // Filtro por Posto
      if (filtroPosto !== 'todos' && item.posto.id !== filtroPosto) {
        return false
      }

      // Filtro por Tipo de Alerta
      if (filtroTipoAlerta !== 'todos' && item.tipoAlerta !== filtroTipoAlerta) {
        return false
      }

      // Filtro por Período
      const dataEscalaStr = (item.escala.data || '').slice(0, 10)
      if (filtroPeriodo === 'hoje') {
        if (dataEscalaStr !== hojeStr) return false
      } else if (filtroPeriodo === '7dias') {
        if (dataEscalaStr < hojeStr || dataEscalaStr > em7DiasStr) return false
      } else if (filtroPeriodo === 'custom') {
        if (dataInicioCustom && dataEscalaStr < dataInicioCustom) return false
        if (dataFimCustom && dataEscalaStr > dataFimCustom) return false
      }

      // Filtro textual
      if (buscaTexto.trim()) {
        const query = buscaTexto.toLowerCase()
        const matchNomePosto = item.posto.nome.toLowerCase().includes(query)
        const matchFuncao = (item.posto.funcao || '').toLowerCase().includes(query)
        const matchEndereco =
          item.posto.endereco &&
          typeof item.posto.endereco === 'object' &&
          `${(item.posto.endereco as any).logradouro || ''} ${(item.posto.endereco as any).bairro || ''} ${(item.posto.endereco as any).cidade || ''}`
            .toLowerCase()
            .includes(query)
        const matchSituacao = item.situacaoAtual.toLowerCase().includes(query)

        if (!matchNomePosto && !matchFuncao && !matchEndereco && !matchSituacao) {
          return false
        }
      }

      return true
    })
  }, [
    todosAlertas,
    filtroPosto,
    filtroTipoAlerta,
    filtroPeriodo,
    dataInicioCustom,
    dataFimCustom,
    buscaTexto,
    nowDate,
  ])

  // Abrir Modal de Convocação Manual
  const handleAbrirConvocacaoModal = (alerta: ItemAlertaCobertura) => {
    setAlertaSelecionado(alerta)
    setModoEnvio('todos')
    setProIdsSelecionados([])
    setModalConvocacaoOpen(true)
  }

  // Abrir Modal de Histórico
  const handleAbrirHistoricoModal = async (escala: EscalaRecord) => {
    setEscalaHistorico(escala)
    setModalHistoricoOpen(true)
    setIsLoadingHistorico(true)
    try {
      const hist = await listarHistoricoDaEscala(escala.id)
      setHistoricoItens(hist)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingHistorico(false)
    }
  }

  // Executar a convocação manual
  const handleConfirmarConvocacaoManual = async () => {
    if (!alertaSelecionado || !user) return

    if (modoEnvio === 'especifico' && proIdsSelecionados.length === 0) {
      toast({
        title: 'Selecione ao menos um profissional',
        description: 'Ou escolha a opção de reenviar para todos os elegíveis.',
        variant: 'destructive',
      })
      return
    }

    setIsSendingConvocacao(true)
    try {
      const res = await executarConvocacaoManual({
        escala: alertaSelecionado.escala,
        posto: alertaSelecionado.posto,
        usuarioId: user.id,
        usuarioNome: user.name || user.email,
        proIdsSelecionados,
        todosElegiveis: modoEnvio === 'todos',
        prosBase: pros,
        convocacoesAtuais: convocacoes,
        todosPostos: postos,
      })

      toast({
        title: 'Convocação manual disparada com sucesso!',
        description: `${res.criadas} profissional(is) foram convocados para o posto ${alertaSelecionado.posto.nome}. Registro salvo no histórico.`,
      })

      setModalConvocacaoOpen(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao disparar convocação manual:', err)
      toast({
        title: 'Erro ao disparar convocação manual',
        description: err?.message || 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSendingConvocacao(false)
    }
  }

  // Toggle seleção de profissional
  const toggleSelectPro = (proId: string) => {
    if (proIdsSelecionados.includes(proId)) {
      setProIdsSelecionados(proIdsSelecionados.filter((id) => id !== proId))
    } else {
      setProIdsSelecionados([...proIdsSelecionados, proId])
    }
  }

  // Helpers visuais para cada tipo de alerta
  const renderBadgeAlerta = (tipo: TipoAlertaCobertura) => {
    switch (tipo) {
      case 'posto_descoberto':
        return (
          <Badge className="bg-red-600 text-white font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1.5 shadow-xs">
            <AlertOctagon className="w-3.5 h-3.5" />
            Posto Descoberto — Sem Ninguém
          </Badge>
        )
      case 'falta_pendente':
        return (
          <Badge className="bg-red-500 text-white font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1.5 shadow-xs">
            <UserX className="w-3.5 h-3.5" />
            Falta Confirmada, Cobertura Pendente
          </Badge>
        )
      case 'reoferta_esgotada':
        return (
          <Badge className="bg-rose-700 text-white font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1.5 shadow-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            Reoferta Esgotada
          </Badge>
        )
      case 'recusa_fixa':
        return (
          <Badge className="bg-amber-500 text-slate-950 font-semibold text-xs px-2.5 py-0.5 flex items-center gap-1.5 shadow-xs">
            <UserCheck className="w-3.5 h-3.5" />
            Recusa do Pro Fixo
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO PAINEL */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-center text-primary">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Painel de Cobertura
                <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full border border-slate-200">
                  Vigilância Operacional
                </span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Cruzamento em tempo real de{' '}
                <strong>postos &times; escalas &times; convocações &times; reofertas</strong> com
                alertas de desguarnecimento.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            className="text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => navigate('/escalas')}
            className="text-xs font-medium"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Ir para Escalas
          </Button>
        </div>
      </div>

      {/* BANNER DE ALERTA DE PRESENÇA SEM CONVOCAÇÃO (NÃO-INTERMEDIAÇÃO) */}
      {alertasSemConvocacao.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-700 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                  Alerta Crítico: Presença sem Convocação Detectada
                  <Badge className="bg-rose-700 text-white font-bold text-xs">
                    {alertasSemConvocacao.length} ocorrência(s)
                  </Badge>
                </h3>
                <p className="text-xs text-rose-800 mt-0.5">
                  Profissionais registraram presença no raio de postos de clientes sem convocação
                  formal aceita para a data (auditoria de não-intermediação).
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => navigate('/conferencia-ponto')}
              className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shrink-0"
            >
              Auditar na Conferência de Ponto
            </Button>
          </div>

          <div className="mt-3 pt-3 border-t border-rose-200/80 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {alertasSemConvocacao.slice(0, 3).map((p) => {
              const pro = p.expand?.pro
              const posto = p.expand?.posto || p.expand?.escala?.expand?.posto
              return (
                <div
                  key={p.id}
                  className="bg-white/80 rounded-lg p-2.5 border border-rose-200 flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-slate-900 block">
                      {pro?.name || pro?.email}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      Posto: {posto?.nome || 'Posto'} &bull;{' '}
                      {new Date(p.timestamp_real).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700">
                    {new Date(p.timestamp_real).toLocaleDateString('pt-BR')}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CARDS NO TOPO COM TOTAL DE CADA TIPO DE ALERTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Posto descoberto — sem ninguém */}
        <Card
          onClick={() =>
            setFiltroTipoAlerta(
              filtroTipoAlerta === 'posto_descoberto' ? 'todos' : 'posto_descoberto',
            )
          }
          className={`cursor-pointer transition-all border ${
            contadores.postosDescobertos > 0
              ? 'bg-red-50/80 border-red-300 hover:border-red-400 hover:shadow-sm'
              : 'bg-emerald-50/50 border-emerald-200'
          } ${filtroTipoAlerta === 'posto_descoberto' ? 'ring-2 ring-red-500' : ''}`}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  contadores.postosDescobertos > 0 ? 'text-red-800' : 'text-emerald-800'
                }`}
              >
                Postos Descobertos
              </span>
              <AlertOctagon
                className={`w-4 h-4 ${
                  contadores.postosDescobertos > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              />
            </div>
            <div
              className={`text-3xl font-black mt-2 ${
                contadores.postosDescobertos > 0 ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {contadores.postosDescobertos}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {contadores.postosDescobertos > 0
                ? 'Hoje/amanhã sem pro nem reoferta ativa'
                : 'Nenhum posto descoberto sem cobertura'}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Falta confirmada, cobertura pendente */}
        <Card
          onClick={() =>
            setFiltroTipoAlerta(filtroTipoAlerta === 'falta_pendente' ? 'todos' : 'falta_pendente')
          }
          className={`cursor-pointer transition-all border ${
            contadores.faltasPendentes > 0
              ? 'bg-red-50/80 border-red-300 hover:border-red-400 hover:shadow-sm'
              : 'bg-emerald-50/50 border-emerald-200'
          } ${filtroTipoAlerta === 'falta_pendente' ? 'ring-2 ring-red-500' : ''}`}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  contadores.faltasPendentes > 0 ? 'text-red-800' : 'text-emerald-800'
                }`}
              >
                Faltas Pendentes
              </span>
              <UserX
                className={`w-4 h-4 ${
                  contadores.faltasPendentes > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              />
            </div>
            <div
              className={`text-3xl font-black mt-2 ${
                contadores.faltasPendentes > 0 ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {contadores.faltasPendentes}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {contadores.faltasPendentes > 0
                ? 'Falta registrada com reoferta aguardando aceite'
                : 'Nenhuma falta aguardando aceite'}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Reoferta esgotada */}
        <Card
          onClick={() =>
            setFiltroTipoAlerta(
              filtroTipoAlerta === 'reoferta_esgotada' ? 'todos' : 'reoferta_esgotada',
            )
          }
          className={`cursor-pointer transition-all border ${
            contadores.reofertasEsgotadas > 0
              ? 'bg-rose-50/80 border-rose-300 hover:border-rose-400 hover:shadow-sm'
              : 'bg-emerald-50/50 border-emerald-200'
          } ${filtroTipoAlerta === 'reoferta_esgotada' ? 'ring-2 ring-rose-500' : ''}`}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  contadores.reofertasEsgotadas > 0 ? 'text-rose-800' : 'text-emerald-800'
                }`}
              >
                Reoferta Esgotada
              </span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  contadores.reofertasEsgotadas > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              />
            </div>
            <div
              className={`text-3xl font-black mt-2 ${
                contadores.reofertasEsgotadas > 0 ? 'text-rose-900' : 'text-emerald-900'
              }`}
            >
              {contadores.reofertasEsgotadas}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {contadores.reofertasEsgotadas > 0
                ? 'Turno perdido — requer ação manual'
                : 'Nenhum turno com reofertas esgotadas'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Recusa do pro fixo */}
        <Card
          onClick={() =>
            setFiltroTipoAlerta(filtroTipoAlerta === 'recusa_fixa' ? 'todos' : 'recusa_fixa')
          }
          className={`cursor-pointer transition-all border ${
            contadores.recusasFixa > 0
              ? 'bg-amber-50/80 border-amber-300 hover:border-amber-400 hover:shadow-sm'
              : 'bg-emerald-50/50 border-emerald-200'
          } ${filtroTipoAlerta === 'recusa_fixa' ? 'ring-2 ring-amber-500' : ''}`}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  contadores.recusasFixa > 0 ? 'text-amber-800' : 'text-emerald-800'
                }`}
              >
                Recusas do Pro Fixo
              </span>
              <UserCheck
                className={`w-4 h-4 ${
                  contadores.recusasFixa > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
            </div>
            <div
              className={`text-3xl font-black mt-2 ${
                contadores.recusasFixa > 0 ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              {contadores.recusasFixa}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {contadores.recusasFixa > 0
                ? 'Titular fixo recusou — reoferta para freelancers'
                : 'Titulares fixos confirmados'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* STATUS GERAL SE TUDO ESTIVER COBERTO */}
      {contadores.totalGeral === 0 && !isLoading && (
        <Card className="border border-emerald-200 bg-emerald-50/70 p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold text-emerald-900 text-lg">
                Todos os postos e turnos estão 100% cobertos!
              </h3>
              <p className="text-emerald-700 text-sm">
                Nenhum posto descoberto, falta pendente ou reoferta esgotada no momento. A
                vigilância operacional segue ativa.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* BARRA DE FILTROS */}
      <Card className="border border-slate-200 bg-white shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filtro por Posto */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Filtrar por Posto</Label>
              <Select value={filtroPosto} onValueChange={setFiltroPosto}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os postos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Postos ({postos.length})</SelectItem>
                  {postos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Período */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Período de Turno</Label>
              <Select value={filtroPeriodo} onValueChange={(val: any) => setFiltroPeriodo(val)}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Períodos</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7dias">Próximos 7 Dias</SelectItem>
                  <SelectItem value="custom">Período Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Tipo de Alerta */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Tipo de Alerta</Label>
              <Select value={filtroTipoAlerta} onValueChange={setFiltroTipoAlerta}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Alertas ({contadores.totalGeral})</SelectItem>
                  <SelectItem value="posto_descoberto">
                    Posto Descoberto ({contadores.postosDescobertos})
                  </SelectItem>
                  <SelectItem value="falta_pendente">
                    Falta Pendente ({contadores.faltasPendentes})
                  </SelectItem>
                  <SelectItem value="reoferta_esgotada">
                    Reoferta Esgotada ({contadores.reofertasEsgotadas})
                  </SelectItem>
                  <SelectItem value="recusa_fixa">
                    Recusa do Pro Fixo ({contadores.recusasFixa})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Busca textual */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Busca Rápida</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Posto, função, bairro..."
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Campos de Período Customizado */}
          {filtroPeriodo === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-600">De:</Label>
                <Input
                  type="date"
                  value={dataInicioCustom}
                  onChange={(e) => setDataInicioCustom(e.target.value)}
                  className="text-xs h-8 w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-slate-600">Até:</Label>
                <Input
                  type="date"
                  value={dataFimCustom}
                  onChange={(e) => setDataFimCustom(e.target.value)}
                  className="text-xs h-8 w-36"
                />
              </div>
              {(dataInicioCustom || dataFimCustom) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDataInicioCustom('')
                    setDataFimCustom('')
                  }}
                  className="text-xs text-slate-500 h-8"
                >
                  Limpar Datas
                </Button>
              )}
            </div>
          )}

          {/* Resumo de filtros ativos */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>
              Exibindo <strong>{alertasFiltrados.length}</strong> alerta(s) de{' '}
              <strong>{contadores.totalGeral}</strong> total.
            </span>
            {(filtroPosto !== 'todos' ||
              filtroPeriodo !== 'todos' ||
              filtroTipoAlerta !== 'todos' ||
              buscaTexto) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltroPosto('todos')
                  setFiltroPeriodo('todos')
                  setFiltroTipoAlerta('todos')
                  setBuscaTexto('')
                  setDataInicioCustom('')
                  setDataFimCustom('')
                }}
                className="text-xs text-primary hover:text-primary/80 p-0 h-auto"
              >
                Limpar todos os filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LISTA DETALHADA DE ALERTAS (ORDENADA POR URGÊNCIA: PRÓXIMAS 24H PRIMEIRO) */}
      <Card className="border border-slate-200 bg-white shadow-xs">
        <CardHeader className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Turnos em Alerta Operacional
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Ordenados por urgência crítica (turnos das próximas 24h prioritários).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : alertasFiltrados.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="font-medium text-slate-600">
                Nenhum alerta para os filtros selecionados.
              </p>
              <p className="text-xs text-slate-400">
                Altere os filtros acima para visualizar outros postos ou períodos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {alertasFiltrados.map((alerta) => {
                const posto = alerta.posto
                const escala = alerta.escala
                const end = (posto.endereco as any) || {}
                const isPostoComFixa = !!posto.pro_fixo
                const proFixoData = posto.expand?.pro_fixo

                return (
                  <div
                    key={alerta.id}
                    className={`p-4 sm:p-5 transition-colors hover:bg-slate-50/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                      alerta.isProximas24h ? 'bg-red-50/20 border-l-4 border-l-red-500' : ''
                    }`}
                  >
                    {/* Informações do Posto e Turno */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Linha superior: Alerta + Tags */}
                      <div className="flex flex-wrap items-center gap-2">
                        {renderBadgeAlerta(alerta.tipoAlerta)}

                        {alerta.isProximas24h && (
                          <Badge className="bg-red-100 text-red-900 border-red-300 text-[11px] font-bold">
                            Próximas 24 Horas
                          </Badge>
                        )}

                        {isPostoComFixa && (
                          <Badge
                            variant="outline"
                            className="bg-primary/5 text-primary border-primary/30 text-[10px] font-medium flex items-center gap-1"
                          >
                            <UserCheck className="w-3 h-3" />
                            Posto com Fixa ({proFixoData?.name || 'Designada'})
                          </Badge>
                        )}

                        <Badge
                          variant="outline"
                          className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-semibold uppercase"
                        >
                          {posto.funcao || 'Operacional'}
                        </Badge>
                      </div>

                      {/* Nome do Posto & Endereço */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-primary shrink-0" />
                            <span>{posto.nome}</span>
                          </h3>
                          {alerta.totalVagas && alerta.totalVagas > 1 && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
                              {alerta.vagasAbertas} de {alerta.totalVagas} vagas abertas
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {end.logradouro
                              ? `${end.logradouro}, ${end.numero || 's/n'}`
                              : 'Endereço'}
                            {end.bairro ? ` - ${end.bairro}` : ''}
                            {end.cidade ? `, ${end.cidade}/${end.uf || 'SP'}` : ''}
                          </span>
                        </p>
                      </div>

                      {/* Data / Hora do Turno e Situação */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span>{formatDateBR(escala.data)}</span>
                          <span className="text-slate-400">&bull;</span>
                          <span>
                            {escala.turno_inicio} às {escala.turno_fim} ({posto.carga_horaria || 8}
                            h)
                          </span>
                        </div>

                        {/* Tempo Aberto (Contador) */}
                        <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                          <span>Tempo aberto:</span>
                          <span className="text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded text-[11px] font-bold">
                            {alerta.tempoAbertoFormatado}
                          </span>
                        </div>

                        {/* Blindagem Financeira para Admin (Admin vê motor; Empresa vê apenas regras operacionais) */}
                        {isAdmin && (
                          <div className="text-slate-500 flex items-center gap-1 text-[11px]">
                            <span className="font-semibold text-slate-700">
                              Diária de ref. (Admin):
                            </span>
                            <span>{formatCurrencyBRL(escala.valor_diaria || 180)}</span>
                          </div>
                        )}
                      </div>

                      {/* Descrição da Situação Atual */}
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <strong>Situação Operacional:</strong> {alerta.situacaoAtual}
                          {alerta.convocacoesAtivas.length > 0 && (
                            <span className="text-slate-500 ml-1">
                              ({alerta.convocacoesAtivas.length} pro(s) pendente(s) aguardando
                              aceite).
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botões de Ação Operacional Rápida */}
                    <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between sm:justify-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {/* Botão Ação Rápida: Abrir Convocação Manual */}
                      <Button
                        size="sm"
                        onClick={() => handleAbrirConvocacaoModal(alerta)}
                        className="font-medium text-xs shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Abrir Convocação Manual
                      </Button>

                      <div className="flex items-center gap-2">
                        {/* Botão Histórico da Escala */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAbrirHistoricoModal(escala)}
                          className="text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                          title="Ver histórico de reaberturas e convocações"
                        >
                          <History className="w-3.5 h-3.5 mr-1 text-slate-500" />
                          Histórico
                        </Button>

                        {/* Botão Mensagens com o pro vinculado ou base */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const proAlvo =
                              alerta.proFalta?.id ||
                              alerta.proFixo?.id ||
                              alerta.convocacoesAtivas[0]?.pro ||
                              ''
                            const convAlvo = alerta.convocacoesAtivas[0]?.id || ''
                            navigate(
                              `/mensagens?escala=${escala.id}&convocacao=${convAlvo}&pro=${proAlvo}`,
                            )
                          }}
                          className="text-xs text-primary hover:bg-primary/5"
                          title="Mensagens com a equipe ou profissional"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DE CONVOCAÇÃO MANUAL */}
      <Dialog open={modalConvocacaoOpen} onOpenChange={setModalConvocacaoOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Abrir Convocação Manual de Turno
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Reenvie o turno para profissionais elegíveis ou direcione para um profissional
              específico. O valor da diária é obtido via motor de 3 camadas (com blindagem
              financeira total para a empresa).
            </DialogDescription>
          </DialogHeader>

          {alertaSelecionado && (
            <div className="space-y-4 py-2">
              {/* Resumo do Posto Selecionado */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  {alertaSelecionado.posto.nome}
                </div>
                <div className="text-slate-600">
                  <strong>Função:</strong> {alertaSelecionado.posto.funcao || 'Geral'} &bull;{' '}
                  <strong>Data:</strong> {formatDateBR(alertaSelecionado.escala.data)} (
                  {alertaSelecionado.escala.turno_inicio} às {alertaSelecionado.escala.turno_fim})
                </div>
                <div className="text-slate-500">
                  <strong>Alerta atual:</strong> {alertaSelecionado.tituloAlerta}
                </div>
              </div>

              {/* Opção de Envio: Todos elegíveis vs Direcionado */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700">
                  Como deseja disparar a convocação manual?
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setModoEnvio('todos')}
                    className={`cursor-pointer p-3 rounded-lg border text-xs text-center transition-all ${
                      modoEnvio === 'todos'
                        ? 'border-primary bg-primary/5 text-primary font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Disparar para Todos os Pros Elegíveis
                  </div>
                  <div
                    onClick={() => setModoEnvio('especifico')}
                    className={`cursor-pointer p-3 rounded-lg border text-xs text-center transition-all ${
                      modoEnvio === 'especifico'
                        ? 'border-primary bg-primary/5 text-primary font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Direcionar para Pro(s) Específico(s)
                  </div>
                </div>
              </div>

              {/* Seleção de Profissionais Específicos */}
              {modoEnvio === 'especifico' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">
                      Selecione os Profissionais ({proIdsSelecionados.length} selecionado(s)):
                    </Label>
                    {pros.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (proIdsSelecionados.length === pros.length) {
                            setProIdsSelecionados([])
                          } else {
                            setProIdsSelecionados(pros.map((p) => p.id))
                          }
                        }}
                        className="text-[11px] text-primary h-6 p-0"
                      >
                        {proIdsSelecionados.length === pros.length
                          ? 'Desmarcar todos'
                          : 'Marcar todos'}
                      </Button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 p-1">
                    {pros
                      .filter((p) => p.status === 'ativo' || p.status === 'teste')
                      .filter((p) => {
                        // Mensalista de outro posto NÃO é elegível para cobertura de falta
                        const outroPostoComMensalista = postos.find(
                          (postItem) =>
                            postItem.id !== alertaSelecionado.posto.id &&
                            postItem.pro_fixo === p.id &&
                            (postItem.forma_de_contratacao === 'mensalista' ||
                              postItem.tipo_remuneracao_fixa === 'mensal'),
                        )
                        return !outroPostoComMensalista
                      })
                      .map((pro) => {
                        const isChecked = proIdsSelecionados.includes(pro.id)
                        const isFixa = alertaSelecionado.posto.pro_fixo === pro.id
                        const postoHorista = postos.find(
                          (postItem) =>
                            postItem.pro_fixo === pro.id &&
                            (postItem.forma_de_contratacao === 'horista' ||
                              postItem.tipo_remuneracao_fixa === 'por_hora'),
                        )

                        return (
                          <div
                            key={pro.id}
                            onClick={() => toggleSelectPro(pro.id)}
                            className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer rounded text-xs"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleSelectPro(pro.id)}
                              id={`pro_${pro.id}`}
                            />
                            <div className="flex-1">
                              <span className="font-semibold text-slate-900">
                                {pro.name || pro.email}
                              </span>
                              {isFixa && (
                                <Badge className="ml-2 bg-primary/10 text-primary border-primary/20 text-[9px] px-1 py-0">
                                  Fixa Titular
                                </Badge>
                              )}
                              {postoHorista && !isFixa && (
                                <Badge className="ml-2 bg-indigo-100 text-indigo-800 border-indigo-200 text-[9px] px-1 py-0">
                                  Horista (
                                  {formatCurrencyBRL(
                                    postoHorista.valor_hora ||
                                      postoHorista.valor_remuneracao_fixa ||
                                      0,
                                  )}
                                  /h)
                                </Badge>
                              )}
                              {pro.status === 'teste' && (
                                <Badge className="ml-2 bg-amber-100 text-amber-800 border-amber-200 text-[9px] px-1 py-0">
                                  Em Teste
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Blindagem Financeira: Explicação das Regras de Remuneração */}
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs space-y-1 text-slate-900">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>Regra Contratual & Blindagem Financeira</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Os profissionais recebem a convocação nominal diretamente no aplicativo. Caso o
                  profissional selecionado seja a titular fixa do posto, a remuneração segue o
                  modelo contratado (mensal ou por hora). Caso seja freelancer, o sistema aciona o
                  motor de 3 camadas da plataforma.
                </p>
                {isAdmin && (
                  <div className="mt-1 pt-1 border-t border-primary/20 font-semibold text-[11px] text-slate-900">
                    Visão Admin: Diária estimada do motor:{' '}
                    {formatCurrencyBRL(alertaSelecionado.escala.valor_diaria || 180)}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalConvocacaoOpen(false)}
              disabled={isSendingConvocacao}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarConvocacaoManual}
              disabled={isSendingConvocacao}
              className="font-medium text-xs"
            >
              <Send className={`w-3.5 h-3.5 mr-1.5 ${isSendingConvocacao ? 'animate-spin' : ''}`} />
              {isSendingConvocacao ? 'Disparando...' : 'Confirmar e Convocar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE HISTÓRICO DA ESCALA */}
      <Dialog open={modalHistoricoOpen} onOpenChange={setModalHistoricoOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Histórico Operacional da Escala
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registro auditável de quem reabriu, convocou ou modificou o turno.
            </DialogDescription>
          </DialogHeader>

          {escalaHistorico && (
            <div className="space-y-3 py-2">
              <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <strong>Turno:</strong> {formatDateBR(escalaHistorico.data)} (
                {escalaHistorico.turno_inicio} às {escalaHistorico.turno_fim}) &bull;{' '}
                <strong>Status:</strong> {escalaHistorico.status}
              </div>

              {isLoadingHistorico ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : historicoItens.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Nenhuma ação manual registrada nesta escala ainda.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {historicoItens.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs space-y-1 shadow-2xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span className="capitalize">{item.acao.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {formatDateBR(item.created)} {item.created.slice(11, 16)}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{item.descricao}</p>
                      <div className="text-[10px] text-slate-400">
                        Operador: <strong>{item.expand?.usuario?.name || 'Sistema'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalHistoricoOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
