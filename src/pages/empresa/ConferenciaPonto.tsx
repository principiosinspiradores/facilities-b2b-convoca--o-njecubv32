import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PontoRecord, PostoRecord, UserRecord, AtestadoRecord } from '@/types/facilities'
import { listarAtestados, validarAtestado, getAtestadoArquivoUrl } from '@/services/atestados'
import { useAuth } from '@/contexts/AuthContext'
import { formatDateBR } from '@/lib/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Clock,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  WifiOff,
  ShieldAlert,
  FileText,
  ExternalLink,
  UserCheck,
} from 'lucide-react'

export default function ConferenciaPontoPage() {
  const { user } = useAuth()
  const [tabAtiva, setTabAtiva] = useState<'pontos' | 'atestados' | 'alertas_presenca'>('pontos')
  const [atestados, setAtestados] = useState<AtestadoRecord[]>([])
  const [filtroAtestadoStatus, setFiltroAtestadoStatus] = useState<string>('todos')
  const [modalAtestado, setModalAtestado] = useState<AtestadoRecord | null>(null)
  const [obsAtestado, setObsAtestado] = useState('')
  const [isValidatingAtestado, setIsValidatingAtestado] = useState(false)
  const [pontos, setPontos] = useState<PontoRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filtros
  const [filtroPosto, setFiltroPosto] = useState<string>('todos')
  const [filtroPro, setFiltroPro] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos') // todos | offline | sincronizado_atraso | suspeito | fora_cerca | fora_janela
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('')
  const [filtroDataFim, setFiltroDataFim] = useState<string>('')

  // Modal de Detalhes / Validação e Contestação
  const [modalPonto, setModalPonto] = useState<PontoRecord | null>(null)
  const [observacaoGestao, setObservacaoGestao] = useState('')
  const [isUpdatingPonto, setIsUpdatingPonto] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [pontosRes, postosRes, prosRes, atestadosRes] = await Promise.all([
        pb.collection('pontos').getFullList<PontoRecord>({
          sort: '-timestamp_real',
          expand: 'escala,escala.posto,posto,pro',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          sort: 'nome',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
        listarAtestados().catch(() => []),
      ])

      setPontos(pontosRes)
      setPostos(postosRes)
      setPros(prosRes)
      setAtestados(atestadosRes)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados do espelho de ponto',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtragem dos registros
  const pontosFiltrados = useMemo(() => {
    return pontos.filter((p) => {
      const escala = p.expand?.escala
      const postoId = escala?.posto

      if (filtroPosto !== 'todos' && postoId !== filtroPosto) return false
      if (filtroPro !== 'todos' && p.pro !== filtroPro) return false

      if (filtroStatus !== 'todos') {
        const status = p.status_validacao || 'valido'
        if (status !== filtroStatus) return false
      }

      // Filtro por origem/sincronização offline e indicadores de cerca/janela
      if (filtroOrigem === 'offline' && !p.batido_offline) return false
      if (
        filtroOrigem === 'sincronizado_atraso' &&
        (!p.atraso_sincronizacao_minutos || p.atraso_sincronizacao_minutos < 15)
      )
        return false
      if (filtroOrigem === 'suspeito' && !p.horario_suspeito) return false
      if (filtroOrigem === 'fora_cerca') {
        const fora =
          p.dentro_raio === false ||
          (p.ocorrencia && p.ocorrencia.toLowerCase().includes('fora da cerca'))
        if (!fora) return false
      }
      if (filtroOrigem === 'fora_janela') {
        const fora =
          p.fora_janela === true ||
          (p.ocorrencia &&
            (p.ocorrencia.toLowerCase().includes('fora da janela') ||
              p.ocorrencia.toLowerCase().includes('horário divergente')))
        if (!fora) return false
      }

      if (filtroDataInicio) {
        const dataPonto = p.timestamp_real.slice(0, 10)
        if (dataPonto < filtroDataInicio) return false
      }

      if (filtroDataFim) {
        const dataPonto = p.timestamp_real.slice(0, 10)
        if (dataPonto > filtroDataFim) return false
      }

      return true
    })
  }, [pontos, filtroPosto, filtroPro, filtroStatus, filtroOrigem, filtroDataInicio, filtroDataFim])

  // Ações de Validação / Contestação
  const handleAcaoValidacao = async (novoStatus: 'valido' | 'contestado' | 'aprovado_manual') => {
    if (!modalPonto) return
    setIsUpdatingPonto(true)
    try {
      await pb.collection('pontos').update(modalPonto.id, {
        status_validacao: novoStatus,
        observacao_gestao: observacaoGestao,
      })

      toast({
        title: novoStatus === 'contestado' ? 'Ponto contestado' : 'Ponto validado com sucesso',
        description: `O registro foi marcado como "${novoStatus}".`,
      })

      setModalPonto(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao atualizar validação',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingPonto(false)
    }
  }

  // Exportação CSV do relatório do ponto mensal com novas colunas offline/sincronização
  const handleExportCSV = () => {
    if (pontosFiltrados.length === 0) {
      toast({ title: 'Nenhum registro para exportar', variant: 'destructive' })
      return
    }

    const headers = [
      'ID Registro',
      'Data Turno',
      'Horario Real Batimento',
      'Tipo (Entrada/Saida)',
      'Profissional',
      'Email Pro',
      'Posto de Trabalho',
      'Carga Horaria (h)',
      'Dentro do Raio Geocerca',
      'Distancia Calculada (m)',
      'Raio Posto Calibrado (m)',
      'Precisao GPS (m)',
      'Fora da Janela Tolerancia',
      'Tolerancia Aplicada (minutos)',
      'Origem Offline',
      'Data/Hora Sincronizacao',
      'Atraso Sincronizacao (minutos)',
      'Horario Suspeito Antifraude',
      'Status Validacao',
      'Ocorrencia / Alerta',
      'Observacao Gestao',
    ]

    const rows = pontosFiltrados.map((p) => {
      const escala = p.expand?.escala
      const posto = escala?.expand?.posto
      const pro = p.expand?.pro

      const dataTurno = escala?.data ? escala.data.slice(0, 10) : ''
      const horaReal = new Date(p.timestamp_real).toLocaleTimeString('pt-BR')
      const horaSync = p.sincronizado_em
        ? new Date(p.sincronizado_em).toLocaleString('pt-BR')
        : 'Tempo real'
      const raioPosto = p.raio_posto_m || posto?.raio_geocerca_m || 100
      const foraJanelaStr =
        p.fora_janela || (p.ocorrencia && p.ocorrencia.toLowerCase().includes('fora da janela'))
          ? 'SIM (Fora Janela)'
          : 'NÃO (No Horário)'

      return [
        p.id,
        dataTurno,
        horaReal,
        p.tipo === 'chegada' ? 'Entrada (Chegada)' : 'Saída',
        `"${pro?.name || ''}"`,
        pro?.email || '',
        `"${posto?.nome || ''}"`,
        posto?.carga_horaria || 8,
        p.dentro_raio ? 'SIM (No Raio)' : 'NÃO (Fora da Cerca)',
        p.distancia_metros ?? 0,
        raioPosto,
        p.gps_precisao_m ?? '',
        foraJanelaStr,
        p.tolerancia_aplicada_minutos ?? posto?.tolerancia_entrada_minutos ?? 10,
        p.batido_offline ? 'SIM (Offline)' : 'NÃO (Online)',
        horaSync,
        p.atraso_sincronizacao_minutos ?? 0,
        p.horario_suspeito ? 'SIM (Alerta)' : 'NÃO (Conforme)',
        p.status_validacao || 'valido',
        `"${(p.ocorrencia || 'Regular').replace(/"/g, '""')}"`,
        `"${(p.observacao_gestao || '').replace(/"/g, '""')}"`,
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `relatorio_ponto_facilities_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Relatório CSV exportado',
      description: `${pontosFiltrados.length} registros exportados com sucesso.`,
    })
  }

  // Contadores
  const qtdOffline = useMemo(() => pontos.filter((p) => p.batido_offline).length, [pontos])
  const qtdAtraso = useMemo(
    () => pontos.filter((p) => (p.atraso_sincronizacao_minutos || 0) >= 15).length,
    [pontos],
  )
  const qtdSuspeitos = useMemo(() => pontos.filter((p) => p.horario_suspeito).length, [pontos])
  const qtdForaCerca = useMemo(
    () =>
      pontos.filter(
        (p) =>
          p.dentro_raio === false ||
          (p.ocorrencia && p.ocorrencia.toLowerCase().includes('fora da cerca')),
      ).length,
    [pontos],
  )
  const qtdForaJanela = useMemo(
    () =>
      pontos.filter(
        (p) =>
          p.fora_janela === true ||
          (p.ocorrencia &&
            (p.ocorrencia.toLowerCase().includes('fora da janela') ||
              p.ocorrencia.toLowerCase().includes('horário divergente'))),
      ).length,
    [pontos],
  )

  const atestadosFiltrados = useMemo(() => {
    return atestados.filter((a) => {
      if (filtroAtestadoStatus !== 'todos' && a.status_validacao !== filtroAtestadoStatus)
        return false
      return true
    })
  }, [atestados, filtroAtestadoStatus])

  const alertasPresencaSemConvocacao = useMemo(() => {
    return pontos.filter((p) => p.aviso_sem_convocacao)
  }, [pontos])

  const handleValidarAtestadoAcao = async (status: 'aprovado' | 'rejeitado') => {
    if (!modalAtestado || !user) return
    if (status === 'rejeitado' && !obsAtestado.trim()) {
      toast({
        title: 'Observação obrigatória',
        description:
          'Ao rejeitar o atestado, informe a justificativa detalhada para o profissional.',
        variant: 'destructive',
      })
      return
    }

    setIsValidatingAtestado(true)
    try {
      await validarAtestado({
        atestadoId: modalAtestado.id,
        status,
        validadoPorId: user.id,
        observacao: obsAtestado,
      })

      toast({
        title: status === 'aprovado' ? 'Atestado aprovado!' : 'Atestado rejeitado',
        description:
          status === 'aprovado'
            ? 'A falta foi abonada e a isenção de multa registrada.'
            : 'A rejeição foi registrada e a multa processada.',
      })

      setModalAtestado(null)
      setObsAtestado('')
      loadData()
    } catch (err) {
      console.error('Erro ao validar atestado:', err)
      toast({
        title: 'Erro ao validar atestado',
        description: 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsValidatingAtestado(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-teal-700" />
            Espelho & Conferência de Pontos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Conferência operacional das entradas e saídas com rastreabilidade de batimentos offline,
            sincronização com hora oficial preservada e indicadores de integridade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadData} variant="outline" size="sm" className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Atualizar Dados
          </Button>
          {tabAtiva === 'pontos' && (
            <Button
              onClick={handleExportCSV}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Exportar CSV do Ponto
            </Button>
          )}
        </div>
      </div>

      {/* Tabs principais de navegação: Espelho de Pontos vs Atestados vs Alertas de Presença */}
      <Tabs value={tabAtiva} onValueChange={(v) => setTabAtiva(v as any)} className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger
            value="pontos"
            className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-teal-800"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5 text-teal-700" />
            Espelho de Pontos
          </TabsTrigger>

          <TabsTrigger
            value="atestados"
            className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-teal-800"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-teal-700" />
            Atestados Médicos
            {atestados.filter((a) => a.status_validacao === 'pendente').length > 0 && (
              <span className="ml-2 bg-amber-500 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {atestados.filter((a) => a.status_validacao === 'pendente').length}
              </span>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="alertas_presenca"
            className="text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-rose-800"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
            Alertas de Presença sem Convocação
            {alertasPresencaSemConvocacao.length > 0 && (
              <span className="ml-2 bg-rose-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {alertasPresencaSemConvocacao.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ABA: ATESTADOS MÉDICOS */}
      {tabAtiva === 'atestados' && (
        <div className="space-y-4">
          <Card className="border border-slate-200 bg-white">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Validação e Auditoria de Atestados Médicos
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Analise o comprovante médico anexado pelo pro. Aprovar abona a falta e cancela a
                  multa; rejeitar confirma a ausência e cobra a multa de no-show.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Status:</label>
                <Select value={filtroAtestadoStatus} onValueChange={setFiltroAtestadoStatus}>
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os atestados</SelectItem>
                    <SelectItem value="pendente">Apenas Pendentes</SelectItem>
                    <SelectItem value="aprovado">Aprovados</SelectItem>
                    <SelectItem value="rejeitado">Rejeitados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {atestadosFiltrados.length === 0 ? (
            <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-white">
              <CardContent className="space-y-2">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="font-semibold text-slate-700">Nenhum atestado encontrado</h3>
                <p className="text-xs text-slate-400">
                  Quando profissionais anexarem atestados para turnos com falta, eles constarão
                  aqui.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Data de Envio</th>
                      <th className="p-3">Profissional</th>
                      <th className="p-3">Posto / Turno</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Documento / Anexo</th>
                      <th className="p-3">Validação & Observação</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {atestadosFiltrados.map((a) => {
                      const pro = a.expand?.pro
                      const conv = a.expand?.convocacao
                      const escala = conv?.expand?.escala
                      const posto = escala?.expand?.posto
                      const arquivoUrl = getAtestadoArquivoUrl(a)
                      const isPdf =
                        arquivoUrl.toLowerCase().includes('.pdf') ||
                        a.arquivo?.toLowerCase().endsWith('.pdf')

                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">
                              {new Date(a.data_envio || a.created).toLocaleDateString('pt-BR')}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(a.data_envio || a.created).toLocaleTimeString('pt-BR')}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {pro?.name || pro?.email}
                            </div>
                            <div className="text-[10px] text-slate-400">{pro?.email}</div>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {posto?.nome || 'Posto'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Data do Turno: {formatDateBR(escala?.data)} ({escala?.turno_inicio} às{' '}
                              {escala?.turno_fim})
                            </div>
                          </td>

                          <td className="p-3">
                            <Badge
                              className={
                                a.status_validacao === 'aprovado'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : a.status_validacao === 'rejeitado'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                              }
                            >
                              {a.status_validacao === 'aprovado'
                                ? 'Aprovado'
                                : a.status_validacao === 'rejeitado'
                                  ? 'Rejeitado'
                                  : 'Pendente'}
                            </Badge>
                          </td>

                          <td className="p-3">
                            {arquivoUrl ? (
                              isPdf ? (
                                <a
                                  href={arquivoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-semibold bg-teal-50 px-2 py-1 rounded border border-teal-200"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Abrir PDF
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <a
                                  href={arquivoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-12 h-12 rounded overflow-hidden border border-slate-200 hover:ring-2 hover:ring-teal-500"
                                >
                                  <img
                                    src={arquivoUrl}
                                    alt="Prévia Atestado"
                                    className="w-full h-full object-cover"
                                  />
                                </a>
                              )
                            ) : (
                              <span className="text-slate-400 italic">Sem anexo</span>
                            )}
                          </td>

                          <td className="p-3 max-w-[200px]">
                            {a.status_validacao !== 'pendente' ? (
                              <div className="space-y-0.5 text-[11px]">
                                <div className="text-slate-600">
                                  Validado por:{' '}
                                  <strong>{a.expand?.validado_por?.name || 'Gestão'}</strong>
                                </div>
                                {a.observacao_validacao && (
                                  <div
                                    className="text-slate-500 truncate"
                                    title={a.observacao_validacao}
                                  >
                                    Obs: {a.observacao_validacao}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-700 text-xs">Aguardando decisão</span>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setModalAtestado(a)
                                setObsAtestado(a.observacao_validacao || '')
                              }}
                              className="h-8 text-xs text-teal-700 hover:bg-teal-50"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Avaliar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA: ALERTAS DE PRESENÇA SEM CONVOCAÇÃO */}
      {tabAtiva === 'alertas_presenca' && (
        <div className="space-y-4">
          <Card className="border border-rose-200 bg-rose-50/30">
            <CardContent className="p-4">
              <h3 className="font-bold text-rose-900 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Auditoria de Não-Intermediação & Presença sem Convocação
              </h3>
              <p className="text-rose-700 text-xs mt-1">
                Registros de ponto disparados quando o profissional estava no raio de um posto,
                porém NÃO possuía convocação aceita para a respectiva data. O sistema notifica
                automaticamente empresa e admin.
              </p>
            </CardContent>
          </Card>

          {alertasPresencaSemConvocacao.length === 0 ? (
            <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-white">
              <CardContent className="space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="font-semibold text-slate-700">Nenhum alerta de não-intermediação</h3>
                <p className="text-xs text-slate-400">
                  Todas as presenças registradas no sistema possuíam convocação formalizada.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white border border-rose-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-rose-50/50 text-rose-900 uppercase tracking-wider font-semibold border-b border-rose-200">
                    <tr>
                      <th className="p-3">Data / Hora Real</th>
                      <th className="p-3">Profissional</th>
                      <th className="p-3">Posto Detectado</th>
                      <th className="p-3">Distância / Geocerca</th>
                      <th className="p-3">Foto / Registro</th>
                      <th className="p-3">Alerta Emitido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {alertasPresencaSemConvocacao.map((p) => {
                      const pro = p.expand?.pro
                      const posto = p.expand?.posto || p.expand?.escala?.expand?.posto
                      const fotoUrl = p.foto ? pb.files.getURL(p, p.foto) : null

                      return (
                        <tr key={p.id} className="hover:bg-rose-50/20 bg-rose-50/10">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">
                              {new Date(p.timestamp_real).toLocaleDateString('pt-BR')}
                            </div>
                            <div className="text-[11px] text-rose-700 font-bold">
                              {new Date(p.timestamp_real).toLocaleTimeString('pt-BR')}
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-800">
                              {pro?.name || pro?.email}
                            </div>
                            <div className="text-[10px] text-slate-400">{pro?.email}</div>
                          </td>

                          <td className="p-3 font-semibold text-slate-800">
                            {posto?.nome || 'Posto'}
                          </td>

                          <td className="p-3">
                            <div className="text-slate-700 font-medium">
                              {p.distancia_metros ?? 0}m de distância
                            </div>
                            <span className="text-[10px] text-slate-400 block">
                              Raio calibrado: {p.raio_posto_m || posto?.raio_geocerca_m || 100}m
                            </span>
                          </td>

                          <td className="p-3">
                            {fotoUrl ? (
                              <a href={fotoUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={fotoUrl}
                                  alt="Foto Alerta"
                                  className="w-10 h-10 object-cover rounded border border-rose-300"
                                />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Sem foto</span>
                            )}
                          </td>

                          <td className="p-3">
                            <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px]">
                              Presença sem convocação
                            </Badge>
                            <span className="text-[10px] text-rose-600 block mt-0.5">
                              {p.ocorrencia || 'Alerta automático de não-intermediação'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA: ESPELHO DE PONTOS PADRÃO */}
      {tabAtiva === 'pontos' && (
        <>
          {/* Cartões Rápidos de Integridade, Cerca e Janela de Tolerância */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card
              className={`border transition-all cursor-pointer ${
                filtroOrigem === 'offline' ? 'ring-2 ring-teal-600 bg-teal-50/40' : 'bg-white'
              }`}
              onClick={() => setFiltroOrigem(filtroOrigem === 'offline' ? 'todos' : 'offline')}
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Batidos Offline
                  </span>
                  <span className="text-xl font-bold text-slate-800">{qtdOffline}</span>
                  <span className="text-[10px] text-slate-500 block">Sincronizados</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center">
                  <WifiOff className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border transition-all cursor-pointer ${
                filtroOrigem === 'fora_cerca' ? 'ring-2 ring-rose-500 bg-rose-50/40' : 'bg-white'
              }`}
              onClick={() =>
                setFiltroOrigem(filtroOrigem === 'fora_cerca' ? 'todos' : 'fora_cerca')
              }
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
                    Fora da Cerca
                  </span>
                  <span className="text-xl font-bold text-rose-800">{qtdForaCerca}</span>
                  <span className="text-[10px] text-rose-600 block">&gt; raio calibrado</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border transition-all cursor-pointer ${
                filtroOrigem === 'fora_janela' ? 'ring-2 ring-amber-500 bg-amber-50/40' : 'bg-white'
              }`}
              onClick={() =>
                setFiltroOrigem(filtroOrigem === 'fora_janela' ? 'todos' : 'fora_janela')
              }
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">
                    Fora da Janela
                  </span>
                  <span className="text-xl font-bold text-amber-900">{qtdForaJanela}</span>
                  <span className="text-[10px] text-amber-700 block">&gt; tolerância turno</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border transition-all cursor-pointer ${
                filtroOrigem === 'sincronizado_atraso'
                  ? 'ring-2 ring-amber-500 bg-amber-50/40'
                  : 'bg-white'
              }`}
              onClick={() =>
                setFiltroOrigem(
                  filtroOrigem === 'sincronizado_atraso' ? 'todos' : 'sincronizado_atraso',
                )
              }
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Sinc. c/ Atraso
                  </span>
                  <span className="text-xl font-bold text-amber-800">{qtdAtraso}</span>
                  <span className="text-[10px] text-amber-700 block">&gt;15 min delay</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border transition-all cursor-pointer ${
                filtroOrigem === 'suspeito' ? 'ring-2 ring-rose-500 bg-rose-50/40' : 'bg-white'
              }`}
              onClick={() => setFiltroOrigem(filtroOrigem === 'suspeito' ? 'todos' : 'suspeito')}
            >
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Horário Suspeito
                  </span>
                  <span className="text-xl font-bold text-rose-700">{qtdSuspeitos}</span>
                  <span className="text-[10px] text-rose-600 block">Antifraude</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barra de Filtros */}
          <Card className="border border-slate-200 bg-white">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                {/* Posto */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Posto de Trabalho
                  </label>
                  <Select value={filtroPosto} onValueChange={setFiltroPosto}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os postos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os postos</SelectItem>
                      {postos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Profissional */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Profissional
                  </label>
                  <Select value={filtroPro} onValueChange={setFiltroPro}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os profissionais" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os profissionais</SelectItem>
                      {pros.map((pr) => (
                        <SelectItem key={pr.id} value={pr.id}>
                          {pr.name || pr.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Validação */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Status de Validação
                  </label>
                  <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="valido">Válido / Regular</SelectItem>
                      <SelectItem value="alerta">Alerta (Fora Raio/Horário)</SelectItem>
                      <SelectItem value="aprovado_manual">Aprovado Manualmente</SelectItem>
                      <SelectItem value="contestado">Contestado pela Gestão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Origem e Sincronização */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Origem & Sincronização
                  </label>
                  <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todas as origens" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas as origens e indicadores</SelectItem>
                      <SelectItem value="fora_cerca">Fora da Cerca Digital</SelectItem>
                      <SelectItem value="fora_janela">Fora da Janela de Tolerância</SelectItem>
                      <SelectItem value="offline">Batidos Offline</SelectItem>
                      <SelectItem value="sincronizado_atraso">Sincronizados c/ Atraso</SelectItem>
                      <SelectItem value="suspeito">Horário Suspeito Antifraude</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Data Início */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Data Início
                  </label>
                  <Input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Data Fim */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Data Fim
                  </label>
                  <Input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e) => setFiltroDataFim(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Pontos Registrados */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : pontosFiltrados.length === 0 ? (
            <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-white">
              <CardContent className="space-y-3">
                <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="font-semibold text-slate-700">
                  Nenhum registro de ponto encontrado
                </h3>
                <p className="text-xs text-slate-400">
                  Ajuste os filtros de data, posto, profissional ou origem para localizar os
                  registros.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium gap-2">
                <span>
                  Total: <strong>{pontosFiltrados.length}</strong> registro(s) filtrado(s)
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {
                      pontosFiltrados.filter(
                        (p) =>
                          (p.status_validacao || 'valido') === 'valido' ||
                          p.status_validacao === 'aprovado_manual',
                      ).length
                    }{' '}
                    Validados
                  </span>
                  <span className="flex items-center gap-1 text-amber-700 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {pontosFiltrados.filter((p) => p.status_validacao === 'alerta').length} Com
                    Alerta
                  </span>
                  <span className="flex items-center gap-1 text-rose-700 font-semibold">
                    <XCircle className="w-3.5 h-3.5" />
                    {pontosFiltrados.filter((p) => p.status_validacao === 'contestado').length}{' '}
                    Contestados
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Data / Hora Real</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Profissional</th>
                      <th className="p-3">Posto</th>
                      <th className="p-3">Origem & Sincronização</th>
                      <th className="p-3">Cerca Digital</th>
                      <th className="p-3">Foto Chegada</th>
                      <th className="p-3">Ocorrência / Integridade</th>
                      <th className="p-3">Validação</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pontosFiltrados.map((p) => {
                      const escala = p.expand?.escala
                      const posto = escala?.expand?.posto
                      const pro = p.expand?.pro
                      const dataFormatada = new Date(p.timestamp_real).toLocaleDateString('pt-BR')
                      const horaFormatada = new Date(p.timestamp_real).toLocaleTimeString('pt-BR')
                      const fotoUrl = p.foto ? pb.files.getURL(p, p.foto) : null
                      const temAlerta =
                        p.status_validacao === 'alerta' || !p.dentro_raio || p.horario_suspeito

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            p.horario_suspeito ? 'bg-rose-50/40' : temAlerta ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{dataFormatada}</div>
                            <div className="text-[11px] text-slate-600 font-bold">
                              {horaFormatada}
                            </div>
                            <span className="text-[10px] text-slate-400 block">
                              Hora oficial batida
                            </span>
                          </td>

                          <td className="p-3">
                            <Badge
                              className={
                                p.tipo === 'chegada'
                                  ? 'bg-teal-100 text-teal-800 border-teal-200 uppercase text-[10px]'
                                  : 'bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]'
                              }
                            >
                              {p.tipo === 'chegada' ? 'Entrada' : 'Saída'}
                            </Badge>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {pro?.name || pro?.email}
                            </div>
                            <div className="text-[10px] text-slate-400">{pro?.email}</div>
                          </td>

                          <td className="p-3 font-medium text-slate-700">
                            {posto?.nome || 'Posto'}
                          </td>

                          {/* Coluna Origem & Sincronização */}
                          <td className="p-3">
                            {p.batido_offline ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-teal-100 text-teal-800 border-teal-300 text-[10px] flex items-center gap-1 w-fit">
                                  <WifiOff className="w-3 h-3 text-teal-700" />
                                  Batido Offline
                                </Badge>
                                {p.atraso_sincronizacao_minutos &&
                                p.atraso_sincronizacao_minutos >= 5 ? (
                                  <span className="text-[10px] text-slate-500 block">
                                    Sincronizado com atraso de{' '}
                                    <strong>
                                      {p.atraso_sincronizacao_minutos >= 60
                                        ? `${(p.atraso_sincronizacao_minutos / 60).toFixed(1)}h`
                                        : `${p.atraso_sincronizacao_minutos}min`}
                                    </strong>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 block">
                                    Sincronizado logo após
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div>
                                <Badge variant="outline" className="text-slate-600 text-[10px]">
                                  Online Direto
                                </Badge>
                              </div>
                            )}
                          </td>

                          {/* Cerca Digital & Distância */}
                          <td className="p-3">
                            {p.dentro_raio ? (
                              <div className="text-emerald-700 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Dentro ({p.distancia_metros ?? 0}m)
                              </div>
                            ) : (
                              <div className="text-rose-600 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Fora da cerca ({p.distancia_metros ?? 0}m)
                              </div>
                            )}
                            <span className="text-[10px] text-slate-500 block">
                              Raio do posto: {p.raio_posto_m || posto?.raio_geocerca_m || 100}m
                              {p.gps_precisao_m ? ` &bull; GPS: ±${p.gps_precisao_m}m` : ''}
                            </span>
                          </td>

                          {/* Foto */}
                          <td className="p-3">
                            {fotoUrl ? (
                              <a href={fotoUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={fotoUrl}
                                  alt="Foto"
                                  className="w-10 h-10 object-cover rounded border border-slate-200 hover:ring-2 hover:ring-teal-500 transition-all cursor-pointer"
                                />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Sem foto</span>
                            )}
                          </td>

                          {/* Ocorrência / Integridade / Janela */}
                          <td className="p-3 max-w-[220px]">
                            <div className="space-y-1">
                              {p.fora_janela ||
                              (p.ocorrencia &&
                                (p.ocorrencia.toLowerCase().includes('fora da janela') ||
                                  p.ocorrencia.toLowerCase().includes('horário divergente'))) ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] flex items-center gap-1 w-fit">
                                  <Clock className="w-3 h-3 text-amber-700" />
                                  Fora da Janela (Revisão)
                                </Badge>
                              ) : null}

                              {p.horario_suspeito ? (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] flex items-center gap-1 w-fit">
                                  <ShieldAlert className="w-3 h-3 text-rose-700" />
                                  Horário Suspeito Antifraude
                                </Badge>
                              ) : null}

                              {p.ocorrencia ? (
                                <span
                                  className="text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] block truncate"
                                  title={p.ocorrencia}
                                >
                                  {p.ocorrencia}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium block">Regular</span>
                              )}
                            </div>
                          </td>

                          {/* Validação */}
                          <td className="p-3">
                            {p.status_validacao === 'contestado' ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Contestado
                              </Badge>
                            ) : p.status_validacao === 'alerta' ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                                Alerta Aberto
                              </Badge>
                            ) : p.status_validacao === 'aprovado_manual' ? (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                                Aprovado Manual
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                Válido
                              </Badge>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setModalPonto(p)
                                setObservacaoGestao(p.observacao_gestao || '')
                              }}
                              className="h-8 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Conferir
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Avaliação de Atestado Médico */}
      <Dialog open={!!modalAtestado} onOpenChange={(open) => !open && setModalAtestado(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <FileText className="w-5 h-5 text-teal-700" />
              Auditoria de Atestado Médico
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Analise o comprovante médico. A aprovação abona a falta; a rejeição cobra a multa de
              no-show.
            </DialogDescription>
          </DialogHeader>

          {modalAtestado &&
            (() => {
              const pro = modalAtestado.expand?.pro
              const conv = modalAtestado.expand?.convocacao
              const escala = conv?.expand?.escala
              const posto = escala?.expand?.posto
              const arquivoUrl = getAtestadoArquivoUrl(modalAtestado)
              const isPdf =
                arquivoUrl.toLowerCase().includes('.pdf') ||
                modalAtestado.arquivo?.toLowerCase().endsWith('.pdf')

              return (
                <div className="space-y-4 py-2 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-slate-700">
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-900 text-sm">
                        {pro?.name || pro?.email}
                      </span>
                      <Badge className="uppercase text-[10px]">
                        {modalAtestado.status_validacao}
                      </Badge>
                    </div>
                    <div>
                      Posto: <strong>{posto?.nome || 'Posto'}</strong>
                    </div>
                    <div>
                      Turno Falta: {formatDateBR(escala?.data)} ({escala?.turno_inicio} às{' '}
                      {escala?.turno_fim})
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Enviado em:{' '}
                      {new Date(modalAtestado.data_envio || modalAtestado.created).toLocaleString(
                        'pt-BR',
                      )}
                    </div>
                  </div>

                  {/* Preview do Arquivo */}
                  <div className="space-y-2">
                    <label className="font-bold text-slate-800 block">Comprovante Anexado:</label>
                    {arquivoUrl ? (
                      isPdf ? (
                        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-center space-y-2">
                          <FileText className="w-10 h-10 text-teal-700 mx-auto" />
                          <p className="font-semibold text-slate-800">Documento PDF anexado</p>
                          <a
                            href={arquivoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-white bg-teal-700 hover:bg-teal-800 px-3 py-1.5 rounded font-semibold"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir PDF em nova aba
                          </a>
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-900 max-h-72 flex items-center justify-center">
                          <a href={arquivoUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={arquivoUrl}
                              alt="Atestado"
                              className="max-h-72 object-contain mx-auto cursor-zoom-in"
                            />
                          </a>
                        </div>
                      )
                    ) : (
                      <p className="text-slate-400 italic">Nenhum arquivo disponível</p>
                    )}
                  </div>

                  {/* Observação */}
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block">
                      Observação da Gestão (obrigatória ao rejeitar)
                    </label>
                    <Input
                      placeholder="Ex: Atestado com CRM legível e CID correspondente / Documento ilegível..."
                      value={obsAtestado}
                      onChange={(e) => setObsAtestado(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              )
            })()}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleValidarAtestadoAcao('rejeitado')}
              disabled={isValidatingAtestado}
              className="text-xs"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Rejeitar Atestado
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalAtestado(null)}
                disabled={isValidatingAtestado}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => handleValidarAtestadoAcao('aprovado')}
                disabled={isValidatingAtestado}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Aprovar & Abonar Falta
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Conferência e Validação/Contestação */}
      <Dialog open={!!modalPonto} onOpenChange={(open) => !open && setModalPonto(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800">
              <Clock className="w-5 h-5 text-teal-700" />
              Conferência de Ponto Digital
            </DialogTitle>
            <DialogDescription>
              Analise as evidências geográficas, de horário real batido e integridade do registro.
            </DialogDescription>
          </DialogHeader>

          {modalPonto && (
            <div className="space-y-4 py-3 text-xs">
              {/* Resumo do Turno e Pro */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 text-sm">
                    {modalPonto.expand?.pro?.name || 'Profissional'}
                  </span>
                  <Badge className="uppercase text-[10px]">
                    {modalPonto.tipo === 'chegada' ? 'Entrada' : 'Saída'}
                  </Badge>
                </div>
                <div className="text-slate-600">
                  Posto: <strong>{modalPonto.expand?.escala?.expand?.posto?.nome}</strong>
                </div>
                <div className="text-slate-600">
                  Turno Programado: {modalPonto.expand?.escala?.turno_inicio} às{' '}
                  {modalPonto.expand?.escala?.turno_fim}
                </div>
                <div className="text-slate-600 flex items-center gap-1.5">
                  Horário Oficial do Batimento:{' '}
                  <strong className="text-teal-900 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                    {new Date(modalPonto.timestamp_real).toLocaleString('pt-BR')}
                  </strong>
                </div>
              </div>

              {/* Rastreabilidade Offline / Sincronização */}
              <div className="bg-teal-50/50 p-3 rounded-lg border border-teal-200 space-y-1">
                <div className="font-bold text-teal-900 flex items-center gap-1.5">
                  <WifiOff className="w-4 h-4 text-teal-700" />
                  Rastreabilidade de Transmissão
                </div>
                <div className="text-slate-700">
                  Origem do Batimento:{' '}
                  <strong>
                    {modalPonto.batido_offline
                      ? 'Registrado Offline no Aparelho'
                      : 'Registrado Online'}
                  </strong>
                </div>
                {modalPonto.sincronizado_em && (
                  <div className="text-slate-700">
                    Sincronizado no Servidor:{' '}
                    <strong>{new Date(modalPonto.sincronizado_em).toLocaleString('pt-BR')}</strong>
                  </div>
                )}
                {modalPonto.atraso_sincronizacao_minutos !== undefined && (
                  <div className="text-slate-700">
                    Tempo até sincronizar:{' '}
                    <strong>
                      {modalPonto.atraso_sincronizacao_minutos >= 60
                        ? `${(modalPonto.atraso_sincronizacao_minutos / 60).toFixed(1)} hora(s)`
                        : `${modalPonto.atraso_sincronizacao_minutos} minuto(s)`}
                    </strong>
                    <span className="text-[11px] text-teal-700 block mt-0.5">
                      ✓ A hora oficial considerada é estritamente a do momento do batimento no
                      aparelho.
                    </span>
                  </div>
                )}
              </div>

              {/* Alerta de Horário Suspeito se houver */}
              {modalPonto.horario_suspeito && (
                <div className="bg-rose-50 border border-rose-300 text-rose-900 p-3 rounded-lg">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Alerta Antifraude: Horário Suspeito Detectado
                  </div>
                  <p className="mt-1">
                    O horário registrado neste batimento offline é anterior ao último acesso online
                    conhecido do dispositivo da profissional. Verifique com a profissional se houve
                    alteração manual de relógio ou falha de fuso.
                  </p>
                </div>
              )}

              {/* Análise de Cerca Digital e Janela de Tolerância */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`p-3 rounded-lg border ${
                    modalPonto.dentro_raio
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1">
                    {modalPonto.dentro_raio ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                    Cerca Digital do Posto
                  </div>
                  <div className="mt-1">
                    {modalPonto.dentro_raio ? 'Dentro do raio permitido' : 'Fora da cerca digital'}{' '}
                    ({modalPonto.distancia_metros ?? 0}m de distância)
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Raio calibrado no posto:{' '}
                    {modalPonto.raio_posto_m ||
                      modalPonto.expand?.escala?.expand?.posto?.raio_geocerca_m ||
                      100}
                    m{modalPonto.gps_precisao_m ? ` • GPS: ±${modalPonto.gps_precisao_m}m` : ''}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg border ${
                    modalPonto.fora_janela ||
                    (modalPonto.ocorrencia &&
                      modalPonto.ocorrencia.toLowerCase().includes('fora da janela'))
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1">
                    <Clock className="w-4 h-4 text-teal-700" />
                    Janela de Horário
                  </div>
                  <div className="mt-1 font-semibold">
                    {modalPonto.fora_janela ||
                    (modalPonto.ocorrencia &&
                      modalPonto.ocorrencia.toLowerCase().includes('fora da janela'))
                      ? 'Fora da janela de tolerância'
                      : 'Dentro da tolerância do turno'}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    Tolerância do posto:{' '}
                    {modalPonto.tolerancia_aplicada_minutos ||
                      modalPonto.expand?.escala?.expand?.posto?.tolerancia_entrada_minutos ||
                      10}{' '}
                    min
                  </div>
                </div>
              </div>

              {/* Ocorrências */}
              {modalPonto.ocorrencia && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">
                  <div className="font-bold flex items-center gap-1 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Ocorrências Registradas
                  </div>
                  <p className="mt-1">{modalPonto.ocorrencia}</p>
                </div>
              )}

              {/* Foto da Chegada */}
              {modalPonto.foto && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Foto de Registro</label>
                  <img
                    src={pb.files.getURL(modalPonto, modalPonto.foto)}
                    alt="Foto do ponto"
                    className="w-full max-h-60 object-contain rounded border border-slate-200 bg-slate-900"
                  />
                </div>
              )}

              {/* Campo para Observação da Gestão */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Observação / Justificativa da Gestão
                </label>
                <Input
                  placeholder="Ex: Ponto aprovado após justificativa operacional de falta de sinal no posto..."
                  value={observacaoGestao}
                  onChange={(e) => setObservacaoGestao(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleAcaoValidacao('contestado')}
              disabled={isUpdatingPonto}
              className="text-xs"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Contestar Ponto
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalPonto(null)}
                disabled={isUpdatingPonto}
                className="text-xs"
              >
                Fechar
              </Button>
              <Button
                type="button"
                onClick={() => handleAcaoValidacao('aprovado_manual')}
                disabled={isUpdatingPonto}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Validar / Aprovar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
