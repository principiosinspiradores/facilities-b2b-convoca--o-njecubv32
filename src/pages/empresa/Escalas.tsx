import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
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
import { useNavigate } from 'react-router-dom'
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
  MessageSquare,
  Filter,
  Search,
  UserX,
  Palmtree,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Zap,
  Edit2,
  Trash2,
  Calculator,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'

export default function EscalasPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
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
  const [selectedGrupoParaConvocar, setSelectedGrupoParaConvocar] = useState<any | null>(null)
  const [selectedProIds, setSelectedProIds] = useState<string[]>([])
  const [isSendingConvocacoes, setIsSendingConvocacoes] = useState(false)
  const [gruposExpandidos, setGruposExpandidos] = useState<Record<string, boolean>>({})

  // Filtros de período e visualização
  const [filtroPeriodo, setFiltroPeriodo] = useState<
    'hoje' | 'semana' | 'mes' | 'custom' | 'todos'
  >('semana')
  const [dataDeCustom, setDataDeCustom] = useState('')
  const [dataAteCustom, setDataAteCustom] = useState('')
  const [filtroPosto, setFiltroPosto] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [buscaTexto, setBuscaTexto] = useState('')

  // Modal de Cobertura por Período (Férias / Ausência da Fixa)
  const [modalCoberturaPeriodo, setModalCoberturaPeriodo] = useState(false)
  const [coberturaPostoId, setCoberturaPostoId] = useState('')
  const [coberturaDataInicio, setCoberturaDataInicio] = useState('')
  const [coberturaDataFim, setCoberturaDataFim] = useState('')
  const [coberturaMotivo, setCoberturaMotivo] = useState<
    'ferias' | 'licenca' | 'atestado' | 'outro'
  >('ferias')
  const [coberturaObservacao, setCoberturaObservacao] = useState('')
  const [coberturaModoEnvio, setCoberturaModoEnvio] = useState<'todos' | 'especifico'>('todos')
  const [coberturaProIdsSelecionados, setCoberturaProIdsSelecionados] = useState<string[]>([])
  const [isProcessandoCobertura, setIsProcessandoCobertura] = useState(false)

  // Modal Editar Escala
  const [modalEditarEscala, setModalEditarEscala] = useState(false)
  const [escalaParaEditar, setEscalaParaEditar] = useState<EscalaRecord | null>(null)
  const [editData, setEditData] = useState('')
  const [editTurnoInicio, setEditTurnoInicio] = useState('')
  const [editTurnoFim, setEditTurnoFim] = useState('')
  const [editObservacao, setEditObservacao] = useState('')
  const [editValorDiaria, setEditValorDiaria] = useState(0)
  const [editRegraCalculada, setEditRegraCalculada] = useState('')
  const [calculandoEditDiaria, setCalculandoEditDiaria] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Modal Confirmar Exclusão de Escala Individual
  const [modalExcluirEscala, setModalExcluirEscala] = useState(false)
  const [escalaParaExcluir, setEscalaParaExcluir] = useState<EscalaRecord | null>(null)
  const [isDeletingEscala, setIsDeletingEscala] = useState(false)

  // Modal Confirmar Exclusão de Turno Inteiro (Grupo Multi-Vagas)
  const [modalExcluirTurnoInteiro, setModalExcluirTurnoInteiro] = useState(false)
  const [grupoParaExcluirTurno, setGrupoParaExcluirTurno] = useState<any | null>(null)
  const [isDeletingTurnoInteiro, setIsDeletingTurnoInteiro] = useState(false)

  // Estado de Recálculo em Andamento
  const [recalculandoId, setRecalculandoId] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [escalasRes, postosRes, prosRes, convocacoesRes] = await Promise.all([
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: 'data,turno_inicio',
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
        // Posto freelancer: estimar com base atual do posto + exceções vigentes
        const end = (selectedPosto.endereco as any) || {}
        const dataRef = dataEscala || dataInicio || formatLocalDate(new Date())
        estimarDiariaParaData(
          selectedPosto.id,
          dataRef,
          ch,
          end.cidade,
          end.uf,
          selectedPosto.valor_diaria_base,
        )
          .then((est) => {
            setValorDiaria(est.valor)
          })
          .catch(() => {
            setValorDiaria(
              selectedPosto.valor_diaria_base && Number(selectedPosto.valor_diaria_base) > 0
                ? Number(selectedPosto.valor_diaria_base)
                : ch <= 4
                  ? 130
                  : ch <= 6
                    ? 160
                    : 180,
            )
          })
      }
    }
  }, [selectedPosto])

  // Helpers de data no fuso local (YYYY-MM-DD)
  const formatLocalDate = (d: Date): string => {
    const ano = d.getFullYear()
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  // Obter strings YYYY-MM-DD para Hoje, Início/Fim da Semana, Início/Fim do Mês
  const periodosCalculados = useMemo(() => {
    const hoje = new Date()
    const hojeStr = formatLocalDate(hoje)

    // Esta semana (segunda-feira até domingo)
    const diaSemanaHoje = hoje.getDay() // 0=Dom, 1=Seg...
    const diasAteSegunda = diaSemanaHoje === 0 ? -6 : 1 - diaSemanaHoje
    const inicioSemana = new Date(hoje)
    inicioSemana.setDate(hoje.getDate() + diasAteSegunda)
    const fimSemana = new Date(inicioSemana)
    fimSemana.setDate(inicioSemana.getDate() + 6)
    const semanaInicioStr = formatLocalDate(inicioSemana)
    const semanaFimStr = formatLocalDate(fimSemana)

    // Este mês (1º dia até último dia do mês atual)
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
    const mesInicioStr = formatLocalDate(inicioMes)
    const mesFimStr = formatLocalDate(fimMes)

    return {
      hojeStr,
      semanaInicioStr,
      semanaFimStr,
      mesInicioStr,
      mesFimStr,
    }
  }, [])

  // Tipagem interna para itens da listagem agrupada
  interface EscalaAgrupadaItem {
    id: string // grupo_postoId_data_turnoIni_turnoFim
    chaveGrupo: string
    isGrupoMultiVagas: boolean
    totalVagas: number
    vagasCobertas: number
    escalas: EscalaRecord[]
    // Para acesso direto às propriedades comuns
    primeiraEscala: EscalaRecord
    posto?: PostoRecord
    data: string
    turno_inicio: string
    turno_fim: string
    statusGeral: 'aberta' | 'convocada' | 'aceita' | 'coberta' | 'falta' | 'cancelada' | 'concluida'
  }

  // Filtragem, Ordenação e Agrupamento
  const { gruposFiltrados, totalTurnosFiltrados, textoPeriodoResumo } = useMemo(() => {
    const { hojeStr, semanaInicioStr, semanaFimStr, mesInicioStr, mesFimStr } = periodosCalculados

    let textoResumo = 'em todos os períodos'

    const filtradas = escalas.filter((escala) => {
      const dataStr = (escala.data || '').slice(0, 10)

      // 1. Filtro de Período
      if (filtroPeriodo === 'hoje') {
        textoResumo = 'hoje'
        if (dataStr !== hojeStr) return false
      } else if (filtroPeriodo === 'semana') {
        textoResumo = 'nesta semana'
        if (dataStr < hojeStr || dataStr > semanaFimStr) return false
      } else if (filtroPeriodo === 'mes') {
        textoResumo = 'neste mês'
        if (dataStr < hojeStr || dataStr > mesFimStr) return false
      } else if (filtroPeriodo === 'custom') {
        if (dataDeCustom && dataAteCustom) {
          textoResumo = `de ${formatDateBR(dataDeCustom)} a ${formatDateBR(dataAteCustom)}`
          if (dataStr < dataDeCustom || dataStr > dataAteCustom) return false
        } else if (dataDeCustom) {
          textoResumo = `a partir de ${formatDateBR(dataDeCustom)}`
          if (dataStr < dataDeCustom) return false
        } else if (dataAteCustom) {
          textoResumo = `até ${formatDateBR(dataAteCustom)}`
          if (dataStr > dataAteCustom) return false
        } else {
          textoResumo = 'período personalizado'
        }
      } else if (filtroPeriodo === 'todos') {
        textoResumo = 'no total geral'
      }

      // 2. Filtro de Posto
      if (filtroPosto !== 'todos' && escala.posto !== filtroPosto) {
        return false
      }

      // 3. Filtro de Status
      if (filtroStatus !== 'todos' && escala.status !== filtroStatus) {
        return false
      }

      // 4. Busca textual (nome do posto, pro aceito, etc.)
      if (buscaTexto.trim()) {
        const query = buscaTexto.toLowerCase()
        const postoNome = (escala.expand?.posto?.nome || '').toLowerCase()
        const postoFuncao = (escala.expand?.posto?.funcao || '').toLowerCase()
        const statusStr = (escala.status || '').toLowerCase()
        if (
          !postoNome.includes(query) &&
          !postoFuncao.includes(query) &&
          !statusStr.includes(query)
        ) {
          return false
        }
      }

      return true
    })

    // Ordenação do dia atual para frente
    filtradas.sort((a, b) => {
      const dataA = (a.data || '').slice(0, 10)
      const dataB = (b.data || '').slice(0, 10)

      const isFuturoA = dataA >= hojeStr
      const isFuturoB = dataB >= hojeStr

      if (isFuturoA && !isFuturoB) return -1
      if (!isFuturoA && isFuturoB) return 1

      if (isFuturoA && isFuturoB) {
        if (dataA !== dataB) return dataA.localeCompare(dataB)
        return (a.turno_inicio || '').localeCompare(b.turno_inicio || '')
      }

      if (dataA !== dataB) return dataB.localeCompare(dataA)
      return (b.turno_inicio || '').localeCompare(a.turno_inicio || '')
    })

    // Agrupamento: mapear escalas idênticas do mesmo posto/dia/turno
    const mapGrupos = new Map<string, EscalaRecord[]>()
    for (const esc of filtradas) {
      const d = (esc.data || '').slice(0, 10)
      const chave = `${esc.posto}_${d}_${esc.turno_inicio}_${esc.turno_fim}`
      if (!mapGrupos.has(chave)) {
        mapGrupos.set(chave, [])
      }
      mapGrupos.get(chave)!.push(esc)
    }

    const listaGrupos: EscalaAgrupadaItem[] = []
    for (const [chave, arrEscalas] of mapGrupos.entries()) {
      const primeira = arrEscalas[0]
      const posto = primeira.expand?.posto
      // Total de vagas do grupo: ou o número de escalas criadas para o turno ou o campo vagas
      const totalVagas = Math.max(arrEscalas.length, primeira.vagas || 1)
      const isMulti = totalVagas > 1 || arrEscalas.length > 1

      // Contar quantas escalas já têm pro aceito/coberto
      let cobertas = 0
      for (const esc of arrEscalas) {
        const convs = convocacoes.filter((c) => c.escala === esc.id)
        const temAceito = convs.some((c) => c.status === 'aceita' || c.status === 'coberta')
        if (
          temAceito ||
          esc.status === 'aceita' ||
          esc.status === 'coberta' ||
          esc.status === 'concluida'
        ) {
          cobertas++
        }
      }

      let stGeral: EscalaAgrupadaItem['statusGeral'] = 'aberta'
      if (cobertas >= totalVagas && totalVagas > 0) {
        stGeral = 'aceita'
      } else if (cobertas > 0) {
        stGeral = 'convocada'
      } else {
        const algumConvocado = arrEscalas.some((e) => e.status === 'convocada')
        if (algumConvocado) stGeral = 'convocada'
      }

      listaGrupos.push({
        id: chave,
        chaveGrupo: chave,
        isGrupoMultiVagas: isMulti,
        totalVagas,
        vagasCobertas: cobertas,
        escalas: arrEscalas,
        primeiraEscala: primeira,
        posto,
        data: (primeira.data || '').slice(0, 10),
        turno_inicio: primeira.turno_inicio,
        turno_fim: primeira.turno_fim,
        statusGeral: stGeral,
      })
    }

    return {
      gruposFiltrados: listaGrupos,
      totalTurnosFiltrados: filtradas.length,
      textoPeriodoResumo: textoResumo,
    }
  }, [
    escalas,
    convocacoes,
    periodosCalculados,
    filtroPeriodo,
    dataDeCustom,
    dataAteCustom,
    filtroPosto,
    filtroStatus,
    buscaTexto,
  ])

  // Abrir modal de cobertura por período
  const handleAbrirCoberturaPeriodo = (postoId?: string) => {
    if (postoId) {
      setCoberturaPostoId(postoId)
    } else if (postos.length > 0) {
      // Priorizar postos com fixa vinculada se houver
      const postoComFixa = postos.find((p) => !!p.pro_fixo)
      setCoberturaPostoId(postoComFixa ? postoComFixa.id : postos[0].id)
    }
    const hoje = new Date()
    const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000)
    const em7Dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
    setCoberturaDataInicio(formatLocalDate(amanha))
    setCoberturaDataFim(formatLocalDate(em7Dias))
    setCoberturaMotivo('ferias')
    setCoberturaObservacao('')
    setCoberturaModoEnvio('todos')
    setCoberturaProIdsSelecionados([])
    setModalCoberturaPeriodo(true)
  }

  // Executar cobertura por período (férias/ausência da fixa)
  const handleConfirmarCoberturaPeriodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!coberturaPostoId) {
      toast({ title: 'Selecione o posto', variant: 'destructive' })
      return
    }
    if (!coberturaDataInicio || !coberturaDataFim) {
      toast({ title: 'Informe o período (início e término)', variant: 'destructive' })
      return
    }
    if (coberturaDataInicio > coberturaDataFim) {
      toast({ title: 'A data final deve ser igual ou após a data inicial', variant: 'destructive' })
      return
    }

    const postoAlvo = postos.find((p) => p.id === coberturaPostoId)
    if (!postoAlvo) {
      toast({ title: 'Posto não encontrado', variant: 'destructive' })
      return
    }

    const proFixoId = postoAlvo.pro_fixo
    const proFixoObj = pros.find((p) => p.id === proFixoId)

    setIsProcessandoCobertura(true)
    try {
      // 1. Encontrar ou criar as escalas do período para este posto
      const datasDoPeriodo = getDatasDoPeriodo(coberturaDataInicio, coberturaDataFim)
      if (datasDoPeriodo.length === 0) {
        toast({ title: 'Nenhuma data no período', variant: 'destructive' })
        setIsProcessandoCobertura(false)
        return
      }

      // Buscar escalas já existentes no intervalo para este posto
      const escalasExistentes = escalas.filter((esc) => {
        const dStr = (esc.data || '').slice(0, 10)
        return esc.posto === postoAlvo.id && dStr >= coberturaDataInicio && dStr <= coberturaDataFim
      })
      const mapaEscalasExistentes: Record<string, EscalaRecord> = {}
      escalasExistentes.forEach((e) => {
        mapaEscalasExistentes[(e.data || '').slice(0, 10)] = e
      })

      // Mapear candidatos elegíveis (excluindo a fixa do posto!)
      // Mensalistas de OUTROS postos também não cobrem faltas/férias
      const postosComMensalista = postos.filter((p) => {
        const forma = p.forma_de_contratacao || p.tipo_remuneracao_fixa
        return p.pro_fixo && (forma === 'mensalista' || forma === 'mensal')
      })
      const proMensalistaOutrosPostos = new Set<string>()
      for (const p of postosComMensalista) {
        if (p.id !== postoAlvo.id && p.pro_fixo) {
          proMensalistaOutrosPostos.add(p.pro_fixo)
        }
      }

      // Mapa de horistas em algum posto para saber valor_hora do candidato
      const mapaHoristasPostos: Record<string, number> = {}
      for (const p of postos) {
        const forma = p.forma_de_contratacao || p.tipo_remuneracao_fixa
        if (p.pro_fixo && (forma === 'horista' || forma === 'por_hora')) {
          const vHora =
            p.valor_hora !== undefined
              ? Number(p.valor_hora)
              : Number(p.valor_remuneracao_fixa || 0)
          if (vHora > 0) {
            mapaHoristasPostos[p.pro_fixo] = vHora
          }
        }
      }

      // Lista de pros elegíveis para receber as convocações de cobertura
      // A FIXA NÃO É CONVOCADA NAS DATAS DO INTERVALO (está ausente)
      let prosParaConvocar: UserRecord[] = []
      if (coberturaModoEnvio === 'especifico') {
        prosParaConvocar = pros.filter(
          (p) =>
            coberturaProIdsSelecionados.includes(p.id) &&
            p.id !== proFixoId &&
            !proMensalistaOutrosPostos.has(p.id),
        )
      } else {
        prosParaConvocar = pros.filter(
          (p) =>
            p.role === 'pro' &&
            (p.status === 'ativo' || p.status === 'teste') &&
            p.id !== proFixoId &&
            !proMensalistaOutrosPostos.has(p.id),
        )
      }

      if (prosParaConvocar.length === 0) {
        toast({
          title: 'Nenhum profissional disponível para cobertura',
          description:
            'A titular fixa foi excluída do período, mas não há outros profissionais elegíveis selecionados.',
          variant: 'destructive',
        })
        setIsProcessandoCobertura(false)
        return
      }

      const carga = postoAlvo.carga_horaria || 8
      const end = (postoAlvo.endereco as any) || {}
      const nowIso = new Date().toISOString()
      let totalEscalasCobertas = 0
      let totalConvocacoesGeradas = 0

      // Para cada dia do período:
      for (const dataStr of datasDoPeriodo) {
        // A. Obter ou criar a escala do dia
        let escalaId = ''
        let escalaObj = mapaEscalasExistentes[dataStr]

        // Estimar valor da diária para este dia via motor de 3 camadas
        const estimativa = await estimarDiariaParaData(
          postoAlvo.id,
          dataStr,
          carga,
          end.cidade,
          end.uf,
          postoAlvo.valor_diaria_base,
        )
        const valorDiariaCalculada = estimativa.valor || 180

        if (escalaObj) {
          escalaId = escalaObj.id
          // Se houver convocação pendente para a fixa neste dia, cancelar ou marcar como ausência
          if (proFixoId) {
            const convsFixa = convocacoes.filter(
              (c) => c.escala === escalaId && c.pro === proFixoId && c.status === 'pendente',
            )
            for (const c of convsFixa) {
              await pb.collection('convocacoes').update(c.id, {
                status: 'recusada',
                regra_aplicada: `ausência/férias da fixa (${coberturaMotivo})`,
              })
            }
          }
          // Reabrir a vaga daquele período para outro pro cobrir
          await pb.collection('escalas').update(escalaId, {
            status: 'convocada',
            valor_diaria: valorDiariaCalculada,
          })
        } else {
          // Criar escala para o dia
          const isoDate = new Date(`${dataStr}T12:00:00Z`).toISOString()
          const ch = postoAlvo.carga_horaria || 8
          const horaIni = ch === 12 ? '07:00' : ch === 4 ? '08:00' : '07:00'
          const horaFim = ch === 12 ? '19:00' : ch === 4 ? '12:00' : ch === 6 ? '13:00' : '15:00'

          const novaEsc = await pb.collection('escalas').create<EscalaRecord>({
            posto: postoAlvo.id,
            data: isoDate,
            turno_inicio: horaIni,
            turno_fim: horaFim,
            vagas: Math.max(1, postoAlvo.vagas || 1),
            status: 'convocada',
            multa_aplicada: false,
            valor_diaria: valorDiariaCalculada,
          })
          escalaId = novaEsc.id
        }

        totalEscalasCobertas++

        // B. Gerar convocações para os profissionais de cobertura
        // Regras vigentes:
        // - freelancer → motor de diária com carga horária do turno
        // - horista → horas do turno × valor_hora do candidato
        // - fixa não é convocada nas datas do intervalo
        for (const proCandidato of prosParaConvocar) {
          let valDiariaCandidato = valorDiariaCalculada
          let regraCandidato = estimativa.regra || 'motor 3 camadas (cobertura férias)'

          const valorHoraCandidato = mapaHoristasPostos[proCandidato.id]
          if (valorHoraCandidato && valorHoraCandidato > 0) {
            valDiariaCandidato = valorHoraCandidato * carga
            regraCandidato = `cobertura horista (R$ ${valorHoraCandidato.toFixed(2)}/h × ${carga}h)`
          } else if (proCandidato.status === 'teste') {
            valDiariaCandidato = proCandidato.ajuda_custo || 50
            regraCandidato = 'ajuda de custo (teste - cobertura)'
          } else if (proCandidato.valor_negociado && proCandidato.valor_negociado > 0) {
            valDiariaCandidato = proCandidato.valor_negociado
            regraCandidato = 'valor negociado (cobertura)'
          }

          // Checar se já não há convocação deste pro nesta escala
          const jaConvocado = convocacoes.some(
            (c) => c.escala === escalaId && c.pro === proCandidato.id,
          )
          if (!jaConvocado) {
            await pb.collection('convocacoes').create({
              escala: escalaId,
              pro: proCandidato.id,
              status: 'pendente',
              valor_diaria: valDiariaCandidato,
              regra_aplicada: regraCandidato,
              data_convocacao: nowIso,
            })
            totalConvocacoesGeradas++
          }
        }
      }

      toast({
        title: 'Cobertura de período gerada com sucesso!',
        description: `${totalEscalasCobertas} turno(s) abertos de ${formatDateBR(coberturaDataInicio)} a ${formatDateBR(coberturaDataFim)} com ${totalConvocacoesGeradas} convocações disparadas. A titular fixa (${proFixoObj?.name || 'vinculada'}) não foi convocada e retornará à prioridade automaticamente após ${formatDateBR(coberturaDataFim)}.`,
      })

      setModalCoberturaPeriodo(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao gerar cobertura de período:', err)
      toast({
        title: 'Erro ao gerar cobertura de período',
        description: err?.message || 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsProcessandoCobertura(false)
    }
  }

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

            // Freelancer: cálculo pelo motor de 3 camadas por dia (usando valor_diaria_base do posto se preenchido)
            const calc = await estimarDiariaParaData(
              postoObj?.id || '',
              d,
              carga,
              end.cidade,
              end.uf,
              postoObj?.valor_diaria_base,
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
    // Vagas por turno: se posto tiver vagas > 1 (especialmente postos freelancers com múltiplas vagas)
    const vagasPorTurno = Math.max(1, postoObj?.vagas || 1)

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
          // Motor de 3 camadas para freelancers (posto.valor_diaria_base tem precedência sobre a base global)
          const c = await estimarDiariaParaData(
            postoObj?.id || '',
            d,
            carga,
            end.cidade,
            end.uf,
            postoObj?.valor_diaria_base,
          )
          vDiaria = c.valor
          regraCalculada = c.regra
        }

        // Criar N registros de escala para o mesmo dia/turno conforme o número de vagas
        const isoDate = new Date(`${d}T12:00:00Z`).toISOString()

        for (let vagaIdx = 0; vagaIdx < vagasPorTurno; vagaIdx++) {
          const novaEscala = await pb.collection('escalas').create<EscalaRecord>({
            posto: selectedPostoId,
            data: isoDate,
            turno_inicio: turnoInicio,
            turno_fim: turnoFim,
            vagas: vagasPorTurno,
            status: proFixoId && vagaIdx === 0 ? 'convocada' : 'aberta',
            multa_aplicada: false,
            valor_diaria: vDiaria,
          })
          criadas++

          // 2. Se o posto tem pro fixa, a primeira vaga é designada prioritariamente para ela
          if (proFixoId && proFixoObj && vagaIdx === 0) {
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
    setSelectedGrupoParaConvocar(null)
    setSelectedProIds([])
    setModalConvocar(true)
  }

  const openConvocarGrupoModal = (grupo: any) => {
    setSelectedGrupoParaConvocar(grupo)
    setSelectedEscala(grupo.primeiraEscala)
    setSelectedProIds([])
    setModalConvocar(true)
  }

  const toggleExpandirGrupo = (grupoId: string) => {
    setGruposExpandidos((prev) => ({
      ...prev,
      [grupoId]: !prev[grupoId],
    }))
  }

  // Verifica se uma escala individual possui convocação aceita ou status de coberta
  const escalaTemAceite = (escala: EscalaRecord) => {
    const convs = convocacoes.filter((c) => c.escala === escala.id)
    return (
      convs.some((c) => c.status === 'aceita' || c.status === 'coberta') ||
      escala.status === 'aceita' ||
      escala.status === 'coberta' ||
      escala.status === 'concluida'
    )
  }

  // Calcula valor da diária para uma escala em edição
  const calcularValorEdicao = async (
    escala: EscalaRecord,
    novaData: string,
    novoTurnoIni: string,
    novoTurnoFim: string,
  ) => {
    const postoObj = postos.find((p) => p.id === escala.posto)
    const ch = postoObj?.carga_horaria || 8
    const isFixa = !!postoObj?.pro_fixo

    if (isFixa) {
      if (postoObj.tipo_remuneracao_fixa === 'mensal') {
        return {
          valor: 0,
          regra: `fixa mensal (R$ ${(postoObj.valor_remuneracao_fixa || 0).toFixed(2)}/mês)`,
        }
      } else {
        const vHora = postoObj.valor_remuneracao_fixa || 25
        return {
          valor: vHora * ch,
          regra: `fixa por hora (R$ ${vHora.toFixed(2)}/h × ${ch}h)`,
        }
      }
    }

    // Freelancer: cálculo pelo motor com a base atual do posto + exceções vigentes
    const end = (postoObj?.endereco as any) || {}
    const c = await estimarDiariaParaData(
      postoObj?.id || '',
      novaData,
      ch,
      end.cidade,
      end.uf,
      postoObj?.valor_diaria_base,
    )
    return {
      valor: c.valor,
      regra: c.regra,
    }
  }

  // Abrir modal de edição de escala
  const handleAbrirEditarEscala = async (escala: EscalaRecord) => {
    if (escalaTemAceite(escala)) {
      toast({
        title: 'Escala já coberta',
        description: 'Escalas com convocação aceita não podem ser editadas.',
        variant: 'destructive',
      })
      return
    }

    const dStr = (escala.data || '').slice(0, 10)
    setEscalaParaEditar(escala)
    setEditData(dStr)
    setEditTurnoInicio(escala.turno_inicio || '07:00')
    setEditTurnoFim(escala.turno_fim || '15:00')
    setEditObservacao(escala.observacao || '')
    setModalEditarEscala(true)

    setCalculandoEditDiaria(true)
    try {
      const calc = await calcularValorEdicao(
        escala,
        dStr,
        escala.turno_inicio || '07:00',
        escala.turno_fim || '15:00',
      )
      setEditValorDiaria(calc.valor)
      setEditRegraCalculada(calc.regra)
    } catch (err) {
      console.error(err)
      setEditValorDiaria(escala.valor_diaria || 180)
      setEditRegraCalculada('tabela base')
    } finally {
      setCalculandoEditDiaria(false)
    }
  }

  // Recalcular valor quando altera a data no modal de edição
  const handleEditDataChange = async (novaData: string) => {
    setEditData(novaData)
    if (!escalaParaEditar || !novaData) return

    setCalculandoEditDiaria(true)
    try {
      const calc = await calcularValorEdicao(
        escalaParaEditar,
        novaData,
        editTurnoInicio,
        editTurnoFim,
      )
      setEditValorDiaria(calc.valor)
      setEditRegraCalculada(calc.regra)
    } catch (err) {
      console.error(err)
    } finally {
      setCalculandoEditDiaria(false)
    }
  }

  // Salvar edição da escala
  const handleSalvarEdicaoEscala = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!escalaParaEditar) return

    if (!editData || !editTurnoInicio || !editTurnoFim) {
      toast({
        title: 'Preencha todos os campos obrigatórios',
        variant: 'destructive',
      })
      return
    }

    setIsSavingEdit(true)
    try {
      const isoDate = new Date(`${editData}T12:00:00Z`).toISOString()

      // 1. Atualizar a escala
      await pb.collection('escalas').update(escalaParaEditar.id, {
        data: isoDate,
        turno_inicio: editTurnoInicio,
        turno_fim: editTurnoFim,
        observacao: editObservacao,
        valor_diaria: editValorDiaria,
      })

      // 2. Atualizar convocações pendentes vinculadas (se houver) com o novo valor
      const convs = convocacoes.filter(
        (c) => c.escala === escalaParaEditar.id && c.status === 'pendente',
      )
      for (const conv of convs) {
        const proObj = pros.find((p) => p.id === conv.pro)
        let val = editValorDiaria
        let rule = editRegraCalculada || 'recalculada na edição da escala'
        if (proObj?.status === 'teste') {
          val = proObj.ajuda_custo || 50
          rule = 'ajuda de custo (teste)'
        } else if (proObj?.valor_negociado) {
          val = proObj.valor_negociado
          rule = 'valor negociado'
        }
        await pb.collection('convocacoes').update(conv.id, {
          valor_diaria: val,
          regra_aplicada: rule,
        })
      }

      toast({
        title: 'Escala atualizada com sucesso!',
        description: `Novo valor: ${formatCurrencyBRL(editValorDiaria)}. Data e horários alterados.`,
      })
      setModalEditarEscala(false)
      setEscalaParaEditar(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar alterações na escala',
        variant: 'destructive',
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Abrir modal de exclusão de escala individual
  const handleAbrirExcluirEscala = (escala: EscalaRecord) => {
    if (escalaTemAceite(escala)) {
      toast({
        title: 'Escala já coberta',
        description: 'Escalas com convocação aceita não podem ser excluídas.',
        variant: 'destructive',
      })
      return
    }
    setEscalaParaExcluir(escala)
    setModalExcluirEscala(true)
  }

  // Confirmar exclusão de escala individual
  const handleConfirmarExcluirEscala = async () => {
    if (!escalaParaExcluir) return

    setIsDeletingEscala(true)
    try {
      // 1. Identificar e tratar convocações vinculadas
      const convs = convocacoes.filter((c) => c.escala === escalaParaExcluir.id)
      for (const conv of convs) {
        try {
          // Se estiver pendente, notificar via mensagem de sistema antes de remover
          if (conv.status === 'pendente' && conv.pro) {
            try {
              const postoNome = escalaParaExcluir.expand?.posto?.nome || 'o posto'
              const dataFormatada = formatDateBR(escalaParaExcluir.data)
              const textoAviso = `A escala programada para ${dataFormatada} no posto ${postoNome} (${escalaParaExcluir.turno_inicio} às ${escalaParaExcluir.turno_fim}) foi cancelada pela gestão.`
              const convObj = await obterOuCriarConversaContextual(
                escalaParaExcluir.id,
                conv.id,
                conv.pro,
                textoAviso,
              )
              if (convObj) {
                await enviarMensagem(convObj.id, textoAviso, undefined, true)
              }
            } catch (errAviso) {
              console.warn('Não foi possível enviar mensagem de cancelamento:', errAviso)
            }
          }
          await pb.collection('convocacoes').delete(conv.id)
        } catch (errConv) {
          console.warn('Erro ao deletar convocação:', errConv)
        }
      }

      // 2. Excluir a escala
      await pb.collection('escalas').delete(escalaParaExcluir.id)

      toast({
        title: 'Escala excluída com sucesso!',
        description:
          convs.length > 0
            ? `${convs.length} convocação(ões) vinculada(s) foi(ram) cancelada(s)/removida(s).`
            : 'O turno foi removido da grade operacional.',
      })
      setModalExcluirEscala(false)
      setEscalaParaExcluir(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir escala',
        variant: 'destructive',
      })
    } finally {
      setIsDeletingEscala(false)
    }
  }

  // Abrir modal de exclusão de turno inteiro (grupo multi-vagas)
  const handleAbrirExcluirTurnoInteiro = (grupo: any) => {
    const temAlgumAceite = grupo.escalas.some((e: EscalaRecord) => escalaTemAceite(e))
    if (temAlgumAceite || grupo.vagasCobertas > 0) {
      toast({
        title: 'Turno possui vagas cobertas',
        description:
          'Não é possível excluir o turno inteiro pois uma ou mais vagas já possuem aceite.',
        variant: 'destructive',
      })
      return
    }
    setGrupoParaExcluirTurno(grupo)
    setModalExcluirTurnoInteiro(true)
  }

  // Confirmar exclusão de turno inteiro
  const handleConfirmarExcluirTurnoInteiro = async () => {
    if (!grupoParaExcluirTurno) return

    setIsDeletingTurnoInteiro(true)
    try {
      const escalaIds = grupoParaExcluirTurno.escalas.map((e: EscalaRecord) => e.id)
      const convsDoGrupo = convocacoes.filter((c) => escalaIds.includes(c.escala))

      // 1. Remover convocações vinculadas e avisar pendentes
      for (const conv of convsDoGrupo) {
        try {
          if (conv.status === 'pendente' && conv.pro) {
            try {
              const textoAviso = `O turno programado para ${formatDateBR(grupoParaExcluirTurno.data)} no posto ${grupoParaExcluirTurno.posto?.nome || ''} foi cancelado pela gestão.`
              const convObj = await obterOuCriarConversaContextual(
                conv.escala,
                conv.id,
                conv.pro,
                textoAviso,
              )
              if (convObj) {
                await enviarMensagem(convObj.id, textoAviso, undefined, true)
              }
            } catch (errAviso) {
              console.warn('Erro ao avisar cancelamento:', errAviso)
            }
          }
          await pb.collection('convocacoes').delete(conv.id)
        } catch (errConv) {
          console.warn('Erro ao deletar convocação de grupo:', errConv)
        }
      }

      // 2. Remover todas as escalas do grupo
      for (const esc of grupoParaExcluirTurno.escalas) {
        try {
          await pb.collection('escalas').delete(esc.id)
        } catch (errEsc) {
          console.warn('Erro ao deletar escala do grupo:', errEsc)
        }
      }

      toast({
        title: 'Turno inteiro excluído!',
        description: `${grupoParaExcluirTurno.escalas.length} vaga(s) removida(s) com sucesso.`,
      })
      setModalExcluirTurnoInteiro(false)
      setGrupoParaExcluirTurno(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir turno inteiro',
        variant: 'destructive',
      })
    } finally {
      setIsDeletingTurnoInteiro(false)
    }
  }

  // Recalcular valores de uma escala individual (apenas freelancer, sem aceite)
  const handleRecalcularEscalaIndividual = async (escala: EscalaRecord) => {
    if (escalaTemAceite(escala)) {
      toast({
        title: 'Escala já coberta',
        description: 'Escalas com aceite não podem ter valores recalculados.',
        variant: 'destructive',
      })
      return
    }

    const postoObj = postos.find((p) => p.id === escala.posto)
    if (postoObj?.pro_fixo) {
      toast({
        title: 'Posto com profissional fixa',
        description: 'O recálculo pelo motor se aplica apenas a escalas de freelancers.',
      })
      return
    }

    setRecalculandoId(escala.id)
    try {
      const carga = postoObj?.carga_horaria || 8
      const end = (postoObj?.endereco as any) || {}
      const dStr = (escala.data || '').slice(0, 10)

      const est = await estimarDiariaParaData(
        postoObj?.id || '',
        dStr,
        carga,
        end.cidade,
        end.uf,
        postoObj?.valor_diaria_base,
      )

      await pb.collection('escalas').update(escala.id, {
        valor_diaria: est.valor,
      })

      // Atualizar convocações pendentes vinculadas (não as aceitas!)
      const convs = convocacoes.filter((c) => c.escala === escala.id && c.status === 'pendente')
      for (const conv of convs) {
        const proObj = pros.find((p) => p.id === conv.pro)
        let val = est.valor
        let rule = est.regra
        if (proObj?.status === 'teste') {
          val = proObj.ajuda_custo || 50
          rule = 'ajuda de custo (teste)'
        } else if (proObj?.valor_negociado) {
          val = proObj.valor_negociado
          rule = 'valor negociado'
        }
        await pb.collection('convocacoes').update(conv.id, {
          valor_diaria: val,
          regra_aplicada: rule,
        })
      }

      toast({
        title: 'Valor recalculado!',
        description: `Novo valor: ${formatCurrencyBRL(est.valor)} (Regra: ${est.regra}).`,
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao recalcular valor da escala',
        variant: 'destructive',
      })
    } finally {
      setRecalculandoId(null)
    }
  }

  // Recalcular valores de um grupo multi-vagas (apenas freelancer, vagas sem aceite)
  const handleRecalcularGrupoMultiVagas = async (grupo: any) => {
    const postoObj =
      grupo.posto || postos.find((p: PostoRecord) => p.id === grupo.primeiraEscala.posto)
    if (postoObj?.pro_fixo) {
      toast({
        title: 'Posto com profissional fixa',
        description: 'O recálculo pelo motor se aplica apenas a escalas de freelancers.',
      })
      return
    }

    setRecalculandoId(grupo.id)
    try {
      const carga = postoObj?.carga_horaria || 8
      const end = (postoObj?.endereco as any) || {}
      const dStr = (grupo.data || '').slice(0, 10)

      const est = await estimarDiariaParaData(
        postoObj?.id || '',
        dStr,
        carga,
        end.cidade,
        end.uf,
        postoObj?.valor_diaria_base,
      )

      let vagasAtualizadas = 0
      for (const esc of grupo.escalas) {
        // Apenas vagas sem aceite!
        if (!escalaTemAceite(esc)) {
          await pb.collection('escalas').update(esc.id, {
            valor_diaria: est.valor,
          })
          vagasAtualizadas++

          // Atualizar convocações pendentes vinculadas
          const convs = convocacoes.filter((c) => c.escala === esc.id && c.status === 'pendente')
          for (const conv of convs) {
            const proObj = pros.find((p) => p.id === conv.pro)
            let val = est.valor
            let rule = est.regra
            if (proObj?.status === 'teste') {
              val = proObj.ajuda_custo || 50
              rule = 'ajuda de custo (teste)'
            } else if (proObj?.valor_negociado) {
              val = proObj.valor_negociado
              rule = 'valor negociado'
            }
            await pb.collection('convocacoes').update(conv.id, {
              valor_diaria: val,
              regra_aplicada: rule,
            })
          }
        }
      }

      toast({
        title: 'Valores recalculados com sucesso!',
        description: `${vagasAtualizadas} vaga(s) atualizada(s) para ${formatCurrencyBRL(est.valor)} (Regra: ${est.regra}).`,
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao recalcular valores do grupo',
        variant: 'destructive',
      })
    } finally {
      setRecalculandoId(null)
    }
  }

  const handleToggleProSelection = (proId: string) => {
    if (selectedProIds.includes(proId)) {
      setSelectedProIds(selectedProIds.filter((id) => id !== proId))
    } else {
      setSelectedProIds([...selectedProIds, proId])
    }
  }

  // Convocar elegíveis restantes até preencher o total necessário
  const handleConvocarAtePreencher = async (grupo: any) => {
    // Escalas abertas no grupo que ainda não têm pro aceito
    const escalasAbertas = grupo.escalas.filter((esc: EscalaRecord) => {
      const convs = convocacoes.filter((c) => c.escala === esc.id)
      return (
        !convs.some((c) => c.status === 'aceita' || c.status === 'coberta') &&
        esc.status !== 'aceita' &&
        esc.status !== 'coberta'
      )
    })

    const vagasNecessarias = escalasAbertas.length
    if (vagasNecessarias === 0) {
      toast({
        title: 'Turno já totalmente coberto',
        description: 'Todas as vagas deste grupo já foram preenchidas.',
      })
      return
    }

    // Identificar todos os pros já convocados em qualquer escala deste grupo
    const escalaIdsDoGrupo = grupo.escalas.map((e: EscalaRecord) => e.id)
    const proIdsJaConvocados = new Set(
      convocacoes.filter((c) => escalaIdsDoGrupo.includes(c.escala)).map((c) => c.pro),
    )

    // Pros elegíveis (ativos ou teste, exceto já convocados neste grupo)
    const proFixoId = grupo.posto?.pro_fixo
    const elegiveis = pros.filter(
      (p) =>
        (p.status === 'ativo' || p.status === 'teste') &&
        p.id !== proFixoId &&
        !proIdsJaConvocados.has(p.id),
    )

    if (elegiveis.length === 0) {
      toast({
        title: 'Nenhum profissional elegível restante',
        description: 'Todos os profissionais ativos já foram convocados para este grupo.',
        variant: 'destructive',
      })
      return
    }

    // Selecionar os elegíveis necessários (pelo menos as vagas necessárias, ou quantos houver)
    const candidatos = elegiveis.slice(0, vagasNecessarias)
    const now = new Date().toISOString()
    let disparadas = 0

    try {
      for (let i = 0; i < candidatos.length; i++) {
        const proObj = candidatos[i]
        const escalaAlvo = escalasAbertas[i % escalasAbertas.length]

        let rule = 'convocação automática até preencher'
        let val = escalaAlvo.valor_diaria || 180
        if (proObj.status === 'teste') {
          val = proObj.ajuda_custo || 50
          rule = 'ajuda de custo (teste - preenchimento)'
        } else if (proObj.valor_negociado) {
          val = proObj.valor_negociado
          rule = 'valor negociado (preenchimento)'
        }

        await pb.collection('convocacoes').create({
          escala: escalaAlvo.id,
          pro: proObj.id,
          status: 'pendente',
          valor_diaria: val,
          regra_aplicada: rule,
          data_convocacao: now,
        })
        disparadas++

        if (escalaAlvo.status === 'aberta') {
          await pb.collection('escalas').update(escalaAlvo.id, {
            status: 'convocada',
          })
        }
      }

      toast({
        title: 'Convocações disparadas!',
        description: `${disparadas} elegíveis convocados automaticamente para preencher as vagas pendentes.`,
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao convocar elegíveis',
        description: 'Verifique os dados e tente novamente.',
        variant: 'destructive',
      })
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

      // Se estamos convocando para um grupo multi-vagas, distribuir ou associar às escalas abertas do grupo
      const escalasAlvo = selectedGrupoParaConvocar
        ? selectedGrupoParaConvocar.escalas.filter((esc: EscalaRecord) => {
            const convs = convocacoes.filter((c) => c.escala === esc.id)
            return !convs.some((c) => c.status === 'aceita' || c.status === 'coberta')
          })
        : [selectedEscala]

      const alvos = escalasAlvo.length > 0 ? escalasAlvo : [selectedEscala]

      let idxEscala = 0
      for (const proId of selectedProIds) {
        // Atribuir para uma das escalas abertas do grupo de forma distribuída
        const escalaAtual = alvos[idxEscala % alvos.length]
        idxEscala++

        // Checar se já tem convocação
        const existing = convocacoes.find((c) => c.escala === escalaAtual.id && c.pro === proId)
        if (!existing) {
          const proObj = pros.find((p) => p.id === proId)
          let rule = 'tabela base'
          let val = escalaAtual.valor_diaria || 180
          if (proObj?.status === 'teste') {
            val = proObj.ajuda_custo || 50
            rule = 'ajuda de custo (teste)'
          } else if (proObj?.valor_negociado) {
            val = proObj.valor_negociado
            rule = 'valor negociado'
          }

          await pb.collection('convocacoes').create({
            escala: escalaAtual.id,
            pro: proId,
            status: 'pendente',
            valor_diaria: val,
            regra_aplicada: rule,
            data_convocacao: now,
          })

          if (escalaAtual.status === 'aberta') {
            await pb.collection('escalas').update(escalaAtual.id, {
              status: 'convocada',
            })
          }
        }
      }

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
      {/* Topo / Header da Página */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Escalas & Convocação Nominal
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gere os turnos por posto, filtre por período e abra cobertura temporária em caso de
            férias ou ausência da profissional fixa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleAbrirCoberturaPeriodo()}
            className="font-medium border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 text-amber-900"
          >
            <Palmtree className="w-4 h-4 mr-1.5 text-amber-600" />
            Cobertura de Férias / Ausência
          </Button>
          <Button onClick={() => setModalNovaEscala(true)} className="font-medium">
            <Plus className="w-4 h-4 mr-1.5" />
            Gerar Nova Escala
          </Button>
        </div>
      </div>

      {/* Resumo do Total Filtrado + Botão de Recarregar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-slate-200 bg-white shadow-xs md:col-span-2">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-primary" />
                Resumo Operacional do Período
              </span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                <span>{totalTurnosFiltrados}</span>
                <span className="text-sm sm:text-base font-semibold text-slate-600">
                  {totalTurnosFiltrados === 1 ? 'turno' : 'turnos'} {textoPeriodoResumo}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Ordenados por proximidade: do dia de hoje para frente (mais próximo primeiro).
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              title="Atualizar lista"
              className="text-slate-500 hover:text-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-primary/20 bg-primary/5 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Prioridade da Fixa & Cobertura
            </div>
            <div className="text-xs text-slate-600 leading-relaxed">
              Postos com fixa designam automaticamente seus turnos à titular. Em caso de férias ou
              afastamento, use a <strong>Cobertura por Período</strong> para abrir as vagas a outros
              profissionais sem perder o vínculo do posto.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros: Período, Datas De-Até, Posto, Status e Busca */}
      <Card className="border border-slate-200 bg-white shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            {/* Seletor Rápido de Período */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Período:
              </span>
              {[
                { id: 'hoje', label: 'Hoje' },
                { id: 'semana', label: 'Esta Semana' },
                { id: 'mes', label: 'Este Mês' },
                { id: 'custom', label: 'Personalizado' },
                { id: 'todos', label: 'Todos' },
              ].map((p) => {
                const isSelected = filtroPeriodo === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFiltroPeriodo(p.id as any)}
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

            {/* Busca Rápida Textual */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscar por posto, função..."
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Seletor de Posto */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Posto de Trabalho
              </label>
              <Select value={filtroPosto} onValueChange={setFiltroPosto}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os postos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Postos ({postos.length})</SelectItem>
                  {postos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {p.pro_fixo ? '[Fixa]' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Seletor de Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Status da Escala
              </label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="convocada">Convocada</SelectItem>
                  <SelectItem value="aceita">Aceita / Coberta</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campos de Data De - Até (Ativos quando Personalizado) */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                De (Data Inicial)
              </label>
              <Input
                type="date"
                value={dataDeCustom}
                disabled={filtroPeriodo !== 'custom'}
                onChange={(e) => {
                  setDataDeCustom(e.target.value)
                  if (filtroPeriodo !== 'custom') setFiltroPeriodo('custom')
                }}
                className={`text-xs h-9 ${filtroPeriodo !== 'custom' ? 'opacity-60 bg-slate-50' : ''}`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Até (Data Final)
              </label>
              <Input
                type="date"
                value={dataAteCustom}
                disabled={filtroPeriodo !== 'custom'}
                onChange={(e) => {
                  setDataAteCustom(e.target.value)
                  if (filtroPeriodo !== 'custom') setFiltroPeriodo('custom')
                }}
                className={`text-xs h-9 ${filtroPeriodo !== 'custom' ? 'opacity-60 bg-slate-50' : ''}`}
              />
            </div>
          </div>

          {/* Limpar Filtros */}
          {(filtroPeriodo !== 'semana' ||
            filtroPosto !== 'todos' ||
            filtroStatus !== 'todos' ||
            buscaTexto ||
            dataDeCustom ||
            dataAteCustom) && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
              <span>
                Filtros ativos aplicados sobre <strong>{escalas.length}</strong> escalas no total.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltroPeriodo('semana')
                  setFiltroPosto('todos')
                  setFiltroStatus('todos')
                  setBuscaTexto('')
                  setDataDeCustom('')
                  setDataAteCustom('')
                }}
                className="text-xs text-primary hover:text-primary/80 h-auto p-0"
              >
                Restaurar padrão (Esta semana)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de Escalas Filtradas (Agrupadas para vagas múltiplas) */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-white">
          <CardContent className="space-y-3">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">Nenhum turno no período filtrado</h3>
            <p className="text-sm text-slate-400">
              {filtroPeriodo === 'semana'
                ? 'Não há escalas programadas do dia de hoje até o final desta semana. Alterne para "Este mês", "Todos" ou selecione "Personalizado".'
                : 'Nenhum resultado corresponde aos critérios de pesquisa selecionados.'}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltroPeriodo('todos')}
                className="text-xs"
              >
                Ver Todas as Escalas
              </Button>
              <Button
                size="sm"
                onClick={() => setModalNovaEscala(true)}
                className="text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Gerar Nova Escala
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {gruposFiltrados.map((grupo) => {
            const posto = grupo.posto
            const isPostoComFixa = !!posto?.pro_fixo
            const proFixoData = posto?.expand?.pro_fixo

            // Se for vaga = 1 (não-grupo), mantém renderização individual idêntica
            if (!grupo.isGrupoMultiVagas) {
              const escala = grupo.primeiraEscala
              const convsDestaEscala = convocacoes.filter((c) => c.escala === escala.id)
              const aceito = convsDestaEscala.find((c) => c.status === 'aceita')

              let badgeVariant = 'bg-slate-100 text-slate-800'
              if (escala.status === 'aceita') badgeVariant = 'bg-emerald-100 text-emerald-800'
              if (escala.status === 'falta') badgeVariant = 'bg-red-100 text-red-800'
              if (escala.status === 'convocada') badgeVariant = 'bg-amber-100 text-amber-800'

              return (
                <Card
                  key={escala.id}
                  className={`border bg-white transition-shadow hover:shadow-sm ${
                    isPostoComFixa
                      ? 'border-l-4 border-l-primary border-slate-200'
                      : 'border-slate-200'
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold"
                          >
                            {posto?.funcao || 'Posto'}
                          </Badge>
                          <Badge className={`${badgeVariant} text-xs uppercase tracking-wide`}>
                            Status: {escala.status}
                          </Badge>
                          {escala.multa_aplicada && (
                            <Badge className="bg-red-600 text-white text-xs">Multa Aplicada</Badge>
                          )}

                          {isPostoComFixa && (
                            <Badge className="bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              Posto c/ Profissional Fixa: {proFixoData?.name || 'Fixa vinculada'}
                              {isAdmin && (
                                <span>
                                  {' '}
                                  (
                                  {posto?.tipo_remuneracao_fixa === 'por_hora'
                                    ? `Por Hora - ${formatCurrencyBRL(posto.valor_remuneracao_fixa || 0)}/h`
                                    : `Mensalista - ${formatCurrencyBRL(posto?.valor_remuneracao_fixa || 0)}/mês`}
                                  )
                                </span>
                              )}
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 mt-1">
                          {posto?.nome || 'Posto não especificado'}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            {formatDateBR(escala.data)}
                          </span>
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {escala.turno_inicio} às {escala.turno_fim} ({posto?.carga_horaria || 8}
                            h)
                          </span>
                          {isAdmin && (
                            <span>
                              {posto?.tipo_remuneracao_fixa === 'mensal' && isPostoComFixa ? (
                                <strong className="text-primary">
                                  Salário Mensal (
                                  {formatCurrencyBRL(posto.valor_remuneracao_fixa || 0)}/mês)
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
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                        {isPostoComFixa && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAbrirCoberturaPeriodo(posto?.id)}
                            title="Abrir cobertura por período (férias/ausência da titular fixa)"
                            className="border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 text-amber-900 text-xs h-9"
                          >
                            <Palmtree className="w-3.5 h-3.5 mr-1 text-amber-600" />
                            Cobertura / Férias
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const proIdParaMsg = aceito?.pro || convsDestaEscala[0]?.pro || ''
                            const convIdParaMsg = aceito?.id || convsDestaEscala[0]?.id || ''
                            navigate(
                              `/mensagens?escala=${escala.id}&convocacao=${convIdParaMsg}&pro=${proIdParaMsg}`,
                            )
                          }}
                          className="text-primary border-primary/20 hover:bg-primary/5 text-xs h-9"
                        >
                          <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-primary" />
                          Mensagens
                        </Button>

                        {aceito ? (
                          <div className="text-right bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs text-emerald-900">
                            <div className="font-bold flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              Turno Coberto:
                            </div>
                            <div className="font-semibold text-slate-900 truncate max-w-[140px]">
                              {aceito.expand?.pro?.name || 'Profissional'}
                              {isPostoComFixa && aceito.pro === posto?.pro_fixo && (
                                <span className="ml-1 text-[10px] text-primary font-bold">
                                  (Fixa)
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Button
                            onClick={() => openConvocarModal(escala)}
                            className="font-medium text-xs h-9"
                          >
                            <Send className="w-3.5 h-3.5 mr-1.5" />
                            Convocar ({convsDestaEscala.length})
                          </Button>
                        )}
                      </div>
                    </div>

                    {convsDestaEscala.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>Histórico de Convocações Deste Turno</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {convsDestaEscala.map((c) => {
                            const isProFixoDestePosto = isPostoComFixa && c.pro === posto?.pro_fixo
                            return (
                              <div
                                key={c.id}
                                className={`flex items-center gap-2 border px-2.5 py-1 rounded text-xs ${
                                  isProFixoDestePosto
                                    ? 'bg-primary/5 border-primary/30 text-primary'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <span className="font-semibold">
                                  {c.expand?.pro?.name || 'Pro'}
                                  {isProFixoDestePosto && ' (Fixa do Posto)'}
                                </span>
                                {isAdmin && (
                                  <span className="text-slate-500">
                                    {c.valor_diaria && c.valor_diaria > 0
                                      ? `(${formatCurrencyBRL(c.valor_diaria)})`
                                      : '(Fixo Mensal)'}
                                  </span>
                                )}
                                <Badge
                                  variant="outline"
                                  className={
                                    c.status === 'aceita'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                      : c.status === 'recusada'
                                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                                        : c.status === 'cancelada'
                                          ? 'bg-slate-100 text-slate-600 border-slate-300'
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
            }

            // POSTOS COM MÚLTIPLAS VAGAS (ex.: Hotel Golden Park - 5 vagas)
            // Agrupar numa única linha de grupo com contador "3/5 cobertas"
            const isExpandido = !!gruposExpandidos[grupo.id]
            const escalaIds = grupo.escalas.map((e) => e.id)
            const todasConvsGrupo = convocacoes.filter((c) => escalaIds.includes(c.escala))
            const prosAceitos = todasConvsGrupo.filter((c) => c.status === 'aceita')
            const totalCobertas = grupo.vagasCobertas
            const totalVagas = grupo.totalVagas
            const isTotalmenteCoberto = totalCobertas >= totalVagas

            return (
              <Card
                key={grupo.id}
                className={`border bg-white transition-shadow hover:shadow-sm ${
                  isTotalmenteCoberto
                    ? 'border-l-4 border-l-emerald-600 border-slate-200'
                    : 'border-l-4 border-l-primary border-slate-200'
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Destaque das Vagas Múltiplas */}
                        <Badge className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-0.5">
                          {totalVagas} vagas
                        </Badge>
                        <Badge
                          variant="outline"
                          className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold"
                        >
                          {posto?.funcao || 'Função'}
                        </Badge>
                        {/* Contador de Cobertura */}
                        <Badge
                          className={`text-xs font-bold uppercase tracking-wide ${
                            isTotalmenteCoberto
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : totalCobertas > 0
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {totalCobertas}/{totalVagas} cobertas
                        </Badge>
                        <span className="text-xs text-slate-500 font-medium">
                          ({totalVagas - totalCobertas}{' '}
                          {totalVagas - totalCobertas === 1 ? 'vaga restante' : 'vagas restantes'})
                        </span>
                      </div>

                      {/* Título unificado do grupo: "5 vagas — Hotel Golden Park — 08/10" */}
                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        {totalVagas} vagas — {posto?.nome || 'Posto'} — {formatDateBR(grupo.data)}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          {grupo.turno_inicio} às {grupo.turno_fim} ({posto?.carga_horaria || 8}h)
                        </span>
                        {isAdmin && (
                          <span>
                            Remuneração Turno:{' '}
                            <strong className="text-slate-800">
                              {formatCurrencyBRL(grupo.primeiraEscala.valor_diaria)}/vaga
                            </strong>{' '}
                            (Total grupo:{' '}
                            {formatCurrencyBRL(
                              (grupo.primeiraEscala.valor_diaria || 0) * totalVagas,
                            )}
                            )
                          </span>
                        )}
                        {prosAceitos.length > 0 && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {prosAceitos.map((c) => c.expand?.pro?.name || 'Pro').join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                      {/* Botão de Preenchimento Automático: Convocar Elegíveis até Preencher */}
                      {!isTotalmenteCoberto && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConvocarAtePreencher(grupo)}
                          title="Convocar automaticamente todos os profissionais elegíveis restantes até completar as vagas abertas"
                          className="bg-amber-50 hover:bg-amber-100/80 text-amber-900 border-amber-300 text-xs h-9 font-medium"
                        >
                          <Zap className="w-3.5 h-3.5 mr-1 text-amber-600 fill-amber-600" />
                          Convocar elegíveis até preencher
                        </Button>
                      )}

                      {/* Botão Convocar Pros para o grupo */}
                      {!isTotalmenteCoberto && (
                        <Button
                          onClick={() => openConvocarGrupoModal(grupo)}
                          className="font-medium text-xs h-9"
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Convocar ({todasConvsGrupo.length})
                        </Button>
                      )}

                      {/* Botão Expandir / Recolher Escalas Individuais */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpandirGrupo(grupo.id)}
                        className="text-xs text-slate-600 hover:text-slate-900 h-9"
                      >
                        {isExpandido ? (
                          <>
                            <ChevronDown className="w-4 h-4 mr-1 text-primary" />
                            Recolher ({grupo.escalas.length})
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-4 h-4 mr-1 text-primary" />
                            Ver Vagas ({grupo.escalas.length})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Detalhes Expandidos: Escalas Individuais e suas convocações */}
                  {isExpandido && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3 bg-slate-50/70 p-3.5 rounded-lg">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                        <span>
                          Escalas e Vagas Individuais deste Grupo ({grupo.escalas.length} vagas)
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          Cada aceite ocupa 1 vaga. Ao completar {totalVagas}/{totalVagas}, as
                          pendentes são canceladas automaticamente.
                        </span>
                      </div>

                      <div className="space-y-2">
                        {grupo.escalas.map((subEscala, idx) => {
                          const convsDaSub = convocacoes.filter((c) => c.escala === subEscala.id)
                          const subAceito = convsDaSub.find((c) => c.status === 'aceita')

                          return (
                            <div
                              key={subEscala.id}
                              className="bg-white p-3 rounded-md border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                  Vaga #{idx + 1}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    subAceito
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : subEscala.status === 'convocada'
                                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                                        : 'bg-slate-50 text-slate-600'
                                  }
                                >
                                  {subAceito ? 'Coberta' : subEscala.status}
                                </Badge>
                                {subAceito ? (
                                  <span className="font-semibold text-emerald-900">
                                    Profissional: {subAceito.expand?.pro?.name || 'Pro'}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">
                                    {convsDaSub.length} convocação(ões) ativa(s)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {convsDaSub.length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {convsDaSub.map((c) => (
                                      <span
                                        key={c.id}
                                        className={`px-2 py-0.5 rounded text-[11px] border ${
                                          c.status === 'aceita'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
                                            : c.status === 'cancelada'
                                              ? 'bg-slate-100 text-slate-500 border-slate-200 line-through'
                                              : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}
                                      >
                                        {c.expand?.pro?.name || 'Pro'} ({c.status})
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {!subAceito && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openConvocarModal(subEscala)}
                                    className="h-7 text-xs"
                                  >
                                    Convocar
                                  </Button>
                                )}
                              </div>
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
                          ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>Dia Único</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Turno pontual</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoAgendamento('periodo')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium flex flex-col gap-1 transition-all ${
                        tipoAgendamento === 'periodo'
                          ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <CalendarRange className="w-4 h-4 text-primary" />
                        <span>Por Período</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Todos os dias</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoAgendamento('recorrente')}
                      className={`p-2.5 rounded-lg border text-left text-xs font-medium flex flex-col gap-1 transition-all ${
                        tipoAgendamento === 'recorrente'
                          ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary" />
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
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-slate-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-primary">
                      <UserCheck className="w-4 h-4 text-primary" />
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
                    {isAdmin && (
                      <div className="text-[11px] font-semibold text-primary pt-1">
                        Remuneração da Fixa:{' '}
                        {selectedPosto.tipo_remuneracao_fixa === 'por_hora'
                          ? `${formatCurrencyBRL(selectedPosto.valor_remuneracao_fixa || 0)}/hora (Total turno: ${formatCurrencyBRL(
                              (selectedPosto.valor_remuneracao_fixa || 0) *
                                (selectedPosto.carga_horaria || 8),
                            )})`
                          : `${formatCurrencyBRL(selectedPosto.valor_remuneracao_fixa || 0)}/mês contratado (fora do escrow por diária)`}
                      </div>
                    )}
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
                                  ? 'bg-primary text-primary-foreground shadow-xs'
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

                {/* Valor base da diária (ou fixo do posto) — Visível apenas para Admin */}
                {isAdmin &&
                  (!selectedPosto?.pro_fixo ||
                    selectedPosto.tipo_remuneracao_fixa === 'por_hora') && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700 block">
                          Diária Efetiva Estimada (R$)
                        </label>
                        {selectedPosto?.valor_diaria_base &&
                        Number(selectedPosto.valor_diaria_base) > 0 ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                          >
                            Base do posto:{' '}
                            {formatCurrencyBRL(Number(selectedPosto.valor_diaria_base))}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-slate-500">
                            Tabela Global ({selectedPosto?.carga_horaria || 8}h)
                          </Badge>
                        )}
                      </div>
                      <Input
                        type="number"
                        value={valorDiaria}
                        readOnly
                        disabled
                        className="bg-slate-100 text-xs font-semibold text-slate-700 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Para freelancers, o valor final é determinado pelo{' '}
                        <strong>Motor de Preços</strong> (diária base do posto + exceções como
                        treinamento, fim de semana, feriado e teste). Para alterar a base deste
                        posto, edite o cadastro do posto em <strong>Postos de Trabalho</strong>.
                      </p>
                    </div>
                  )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalNovaEscala(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isCreatingEscala || !selectedPostoId}>
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
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Resumo da Criação por Período
                </DialogTitle>
                <DialogDescription>
                  Revise o lote de escalas que será gerado e os valores calculados por dia.
                </DialogDescription>
              </DialogHeader>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3.5 text-xs text-slate-900 space-y-1.5">
                <div className="font-bold text-sm text-slate-900">
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
                  <div className="text-primary font-semibold pt-1">
                    ✓ Prioridade direta: As convocações serão disparadas primeiro para a
                    profissional fixa ({selectedPosto.expand?.pro_fixo?.name}). Se ela recusar ou
                    faltar, o turno é reofertado aos freelancers.
                  </div>
                )}
              </div>

              {calculandoPrevias ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
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
                          {isAdmin ? (
                            <>
                              <span className="font-bold text-primary">
                                {selectedPosto?.tipo_remuneracao_fixa === 'mensal' &&
                                selectedPosto.pro_fixo
                                  ? 'Fixo Mensal'
                                  : formatCurrencyBRL(p.valor)}
                              </span>
                              <span className="text-[10px] text-slate-400 block">{p.regra}</span>
                            </>
                          ) : (
                            <span className="text-xs font-semibold text-primary">Programado</span>
                          )}
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
                  className="font-medium"
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
            <DialogTitle>
              {selectedGrupoParaConvocar
                ? `Convocar Profissionais — ${selectedGrupoParaConvocar.totalVagas} Vagas (${selectedGrupoParaConvocar.posto?.nome || 'Posto'})`
                : 'Convocar Profissionais Elegíveis'}
            </DialogTitle>
            <DialogDescription>
              {selectedGrupoParaConvocar
                ? `Selecione quantos profissionais quiser. Cada aceite preenche 1 vaga do grupo. Quando as ${selectedGrupoParaConvocar.totalVagas} vagas forem atingidas, os convites restantes serão cancelados com aviso aos profissionais.`
                : 'Apenas profissionais cadastrados com documentos validados, status ativo ou teste podem ser convocados.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-800">
                  {selectedGrupoParaConvocar
                    ? `${selectedGrupoParaConvocar.totalVagas} Vagas — ${selectedGrupoParaConvocar.posto?.nome}`
                    : selectedEscala?.expand?.posto?.nome}
                </div>
                <div className="text-slate-500">
                  Data: {formatDateBR(selectedEscala?.data)} ({selectedEscala?.turno_inicio} às{' '}
                  {selectedEscala?.turno_fim})
                  {selectedGrupoParaConvocar && (
                    <span className="ml-2 font-semibold text-primary">
                      &bull; {selectedGrupoParaConvocar.vagasCobertas}/
                      {selectedGrupoParaConvocar.totalVagas} cobertas
                    </span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="text-right">
                  <span className="text-primary font-bold">
                    {formatCurrencyBRL(selectedEscala?.valor_diaria)}/diária
                  </span>
                </div>
              )}
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
                            ? 'bg-primary/5 border-primary text-primary'
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
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <div>
                            <div className="font-semibold">{pro.name || pro.email}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>Status: {pro.status}</span>
                              {isAdmin && pro.status === 'teste' && (
                                <span>(Ajuda de Custo: R$ 50)</span>
                              )}
                              {isAdmin && pro.valor_negociado && (
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
              disabled={isSendingConvocacoes || selectedProIds.length === 0}
            >
              {isSendingConvocacoes
                ? 'Enviando...'
                : `Disparar ${selectedProIds.length} Convocações`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Cobertura por Período (Férias / Ausência da Profissional Fixa) */}
      <Dialog
        open={modalCoberturaPeriodo}
        onOpenChange={(open) => {
          if (!isProcessandoCobertura) setModalCoberturaPeriodo(open)
        }}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleConfirmarCoberturaPeriodo}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-900">
                <Palmtree className="w-5 h-5 text-amber-600" />
                Cobertura por Período (Férias / Ausência)
              </DialogTitle>
              <DialogDescription>
                Abra as vagas de um intervalo de datas para outros profissionais cobrirem — sem
                alterar o vínculo da profissional fixa titular do posto.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Seleção do Posto */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Posto de Trabalho *
                </label>
                <Select value={coberturaPostoId} onValueChange={setCoberturaPostoId}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Selecione o posto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {postos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} ({p.funcao} - {p.carga_horaria}h)
                        {p.pro_fixo ? ' [Tem Fixa]' : ' [Sem Fixa Vinculada]'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Informação sobre a Profissional Fixa */}
              {(() => {
                const postoSelecionado = postos.find((p) => p.id === coberturaPostoId)
                const titular = postoSelecionado?.expand?.pro_fixo

                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5 text-amber-950">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      Regra de Proteção do Vínculo
                    </div>
                    {titular ? (
                      <p className="leading-relaxed">
                        Titular Atual:{' '}
                        <strong>
                          {titular.name || titular.email} ({titular.cpf || 'CPF cadastrado'})
                        </strong>
                        . Durante o intervalo selecionado, a titular <strong>não</strong> será
                        convocada. O vínculo permanece intacto e, ao fim do período, ela voltará a
                        ser convocada prioritariamente de forma automática.
                      </p>
                    ) : (
                      <p className="leading-relaxed text-slate-600">
                        Este posto não possui titular fixa vinculada no momento, mas você pode abrir
                        o período para convocações emergenciais em lote.
                      </p>
                    )}
                    <div className="text-[11px] text-amber-800/80 pt-1 border-t border-amber-200/60 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      Cálculo de Custos: O contrato da fixa segue inalterado no Relatório de Custos
                      e as coberturas computam apenas os turnos efetivamente cumpridos.
                    </div>
                  </div>
                )
              })()}

              {/* Intervalo de Datas da Ausência */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Data Inicial da Cobertura *
                  </label>
                  <Input
                    type="date"
                    value={coberturaDataInicio}
                    onChange={(e) => setCoberturaDataInicio(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Data Final da Cobertura *
                  </label>
                  <Input
                    type="date"
                    value={coberturaDataFim}
                    onChange={(e) => setCoberturaDataFim(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
                <div className="col-span-2 text-[11px] text-slate-500">
                  {coberturaDataInicio &&
                  coberturaDataFim &&
                  coberturaDataInicio <= coberturaDataFim ? (
                    <span className="font-medium text-slate-700">
                      Total: {getDatasDoPeriodo(coberturaDataInicio, coberturaDataFim).length}{' '}
                      dia(s) no intervalo de cobertura.
                    </span>
                  ) : (
                    'Selecione o intervalo completo de afastamento da titular.'
                  )}
                </div>
              </div>

              {/* Motivo do Afastamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Motivo da Cobertura *
                  </label>
                  <Select
                    value={coberturaMotivo}
                    onValueChange={(val: any) => setCoberturaMotivo(val)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ferias">Férias Regulamentares</SelectItem>
                      <SelectItem value="atestado">Atestado / Licença Médica</SelectItem>
                      <SelectItem value="licenca">Licença / Afastamento</SelectItem>
                      <SelectItem value="outro">Outro Motivo Operacional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Observação Interna (Opcional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: Férias de 10 dias aprovadas"
                    value={coberturaObservacao}
                    onChange={(e) => setCoberturaObservacao(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Modo de Envio da Convocação */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Quem deve receber as convocações de cobertura? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCoberturaModoEnvio('todos')}
                    className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                      coberturaModoEnvio === 'todos'
                        ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-primary" />
                      <span>Todos os Elegíveis</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                      Disparar para a base ativa (freelancers/horistas)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCoberturaModoEnvio('especifico')}
                    className={`p-2.5 rounded-lg border text-left text-xs font-medium transition-all ${
                      coberturaModoEnvio === 'especifico'
                        ? 'border-primary bg-primary/5 text-primary font-bold ring-1 ring-primary'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-primary" />
                      <span>Profissionais Específicos</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                      Escolher candidatos manualmente
                    </div>
                  </button>
                </div>
              </div>

              {/* Lista para seleção manual de candidatos */}
              {coberturaModoEnvio === 'especifico' && (
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Selecione os Candidatos ({coberturaProIdsSelecionados.length} selecionados)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Fixa titular excluída automaticamente
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {(() => {
                      const postoSel = postos.find((p) => p.id === coberturaPostoId)
                      const titularId = postoSel?.pro_fixo

                      return pros
                        .filter(
                          (p) =>
                            (p.status === 'ativo' || p.status === 'teste') && p.id !== titularId,
                        )
                        .map((pro) => {
                          const isSelected = coberturaProIdsSelecionados.includes(pro.id)
                          return (
                            <div
                              key={pro.id}
                              onClick={() => {
                                if (isSelected) {
                                  setCoberturaProIdsSelecionados(
                                    coberturaProIdsSelecionados.filter((id) => id !== pro.id),
                                  )
                                } else {
                                  setCoberturaProIdsSelecionados([
                                    ...coberturaProIdsSelecionados,
                                    pro.id,
                                  ])
                                }
                              }}
                              className={`p-2 rounded border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-primary/5 border-primary text-primary font-medium'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <div>
                                  <div className="font-semibold">{pro.name || pro.email}</div>
                                  <div className="text-[10px] text-slate-400">
                                    Status: {pro.status}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-[10px]">
                                Elegível
                              </Badge>
                            </div>
                          )
                        })
                    })()}
                  </div>
                </div>
              )}

              {/* Regras de Remuneração Aplicadas */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-600">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  Regras Vigentes de Convocação de Cobertura
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                  <li>
                    <strong>Freelancer:</strong> Motor de diária em 3 camadas com base na carga
                    horária do posto (adicionais de fim de semana/feriado automáticos).
                  </li>
                  <li>
                    <strong>Horista:</strong> Carga horária do turno × valor por hora do candidato.
                  </li>
                  <li>
                    <strong>Titular Fixa:</strong> Não convocada durante o intervalo selecionado.
                  </li>
                  <li>
                    <strong>Fim do Intervalo:</strong> A titular volta a ter prioridade máxima de
                    convocação nas escalas seguintes.
                  </li>
                </ul>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isProcessandoCobertura}
                onClick={() => setModalCoberturaPeriodo(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  isProcessandoCobertura ||
                  !coberturaPostoId ||
                  !coberturaDataInicio ||
                  !coberturaDataFim ||
                  (coberturaModoEnvio === 'especifico' && coberturaProIdsSelecionados.length === 0)
                }
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {isProcessandoCobertura ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processando Cobertura...
                  </>
                ) : (
                  <>
                    <Palmtree className="w-4 h-4 mr-1.5" />
                    Confirmar e Abrir Cobertura
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
