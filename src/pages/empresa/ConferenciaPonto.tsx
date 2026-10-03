import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PontoRecord, PostoRecord, UserRecord } from '@/types/facilities'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
} from 'lucide-react'

export default function ConferenciaPontoPage() {
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
      const [pontosRes, postosRes, prosRes] = await Promise.all([
        pb.collection('pontos').getFullList<PontoRecord>({
          sort: '-timestamp_real',
          expand: 'escala,escala.posto,pro',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          sort: 'nome',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
      ])

      setPontos(pontosRes)
      setPostos(postosRes)
      setPros(prosRes)
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
            Atualizar
          </Button>
          <Button
            onClick={handleExportCSV}
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV do Ponto
          </Button>
        </div>
      </div>

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
          onClick={() => setFiltroOrigem(filtroOrigem === 'fora_cerca' ? 'todos' : 'fora_cerca')}
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
          onClick={() => setFiltroOrigem(filtroOrigem === 'fora_janela' ? 'todos' : 'fora_janela')}
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
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data Início</label>
              <Input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Data Fim */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data Fim</label>
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
            <h3 className="font-semibold text-slate-700">Nenhum registro de ponto encontrado</h3>
            <p className="text-xs text-slate-400">
              Ajuste os filtros de data, posto, profissional ou origem para localizar os registros.
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
                {pontosFiltrados.filter((p) => p.status_validacao === 'alerta').length} Com Alerta
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
                        <div className="text-[11px] text-slate-600 font-bold">{horaFormatada}</div>
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

                      <td className="p-3 font-medium text-slate-700">{posto?.nome || 'Posto'}</td>

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
