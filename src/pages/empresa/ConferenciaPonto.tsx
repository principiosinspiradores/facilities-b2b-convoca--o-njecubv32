import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { PontoRecord, PostoRecord, UserRecord, EscalaRecord } from '@/types/facilities'
import { formatDateBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  MapPin,
  Calendar,
  Building2,
  UserCheck,
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
  }, [pontos, filtroPosto, filtroPro, filtroStatus, filtroDataInicio, filtroDataFim])

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

  // Exportação CSV do relatório do ponto mensal por posto e por profissional
  const handleExportCSV = () => {
    if (pontosFiltrados.length === 0) {
      toast({ title: 'Nenhum registro para exportar', variant: 'destructive' })
      return
    }

    const headers = [
      'ID Registro',
      'Data Turno',
      'Horario Real',
      'Tipo (Entrada/Saida)',
      'Profissional',
      'Email Pro',
      'Posto de Trabalho',
      'Carga Horaria (h)',
      'Dentro do Raio Geocerca',
      'Distancia Calculada (m)',
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

      return [
        p.id,
        dataTurno,
        horaReal,
        p.tipo === 'chegada' ? 'Entrada (Chegada)' : 'Saída',
        `"${pro?.name || ''}"`,
        pro?.email || '',
        `"${posto?.nome || ''}"`,
        posto?.carga_horaria || 8,
        p.dentro_raio ? 'SIM' : 'NÃO',
        p.distancia_metros ?? 0,
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

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-teal-700" />
            Espelho & Conferência de Pontos (Modelo Profreela)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Conferência operacional das entradas e saídas com alerta visual de geocerca e horário,
            validação e exportação CSV.
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

      {/* Barra de Filtros */}
      <Card className="border border-slate-200 bg-white">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
              Ajuste os filtros de data, posto ou profissional para localizar os registros.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>
              Total: <strong>{pontosFiltrados.length}</strong> registro(s) de ponto
            </span>
            <div className="flex items-center gap-3">
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
                  <th className="p-3">Cerca Digital (Distância)</th>
                  <th className="p-3">Foto Chegada</th>
                  <th className="p-3">Alerta / Ocorrência</th>
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
                    p.status_validacao === 'alerta' || !p.dentro_raio || !!p.ocorrencia

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        temAlerta ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-semibold text-slate-900">{dataFormatada}</div>
                        <div className="text-[11px] text-slate-500">{horaFormatada}</div>
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
                      <td className="p-3">
                        {p.dentro_raio ? (
                          <div className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            No Raio ({p.distancia_metros ?? 0}m)
                          </div>
                        ) : (
                          <div className="text-rose-600 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Fora ({p.distancia_metros ?? 0}m)
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 block">
                          Tolerância: {posto?.raio_geocerca_m || 150}m
                        </span>
                      </td>
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
                      <td className="p-3 max-w-[200px]">
                        {p.ocorrencia ? (
                          <span
                            className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] block truncate"
                            title={p.ocorrencia}
                          >
                            {p.ocorrencia}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Regular</span>
                        )}
                      </td>
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
              Analise as evidências geográficas, fotográficas e decida por validar ou contestar o
              ponto.
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
                <div className="text-slate-600">
                  Horário Real Registrado:{' '}
                  <strong>{new Date(modalPonto.timestamp_real).toLocaleString('pt-BR')}</strong>
                </div>
              </div>

              {/* Análise de Cerca Digital e Horário */}
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
                    Cerca Digital
                  </div>
                  <div className="mt-1">
                    {modalPonto.dentro_raio ? 'Dentro do raio' : 'Fora do raio'} (
                    {modalPonto.distancia_metros ?? 0}m de distância)
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="font-bold text-slate-800">Status Validação Atual</div>
                  <div className="mt-1 font-semibold capitalize text-teal-800">
                    {modalPonto.status_validacao || 'valido'}
                  </div>
                </div>
              </div>

              {/* Ocorrências */}
              {modalPonto.ocorrencia && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg">
                  <div className="font-bold flex items-center gap-1 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Alerta de Divergência Gerado
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
                  placeholder="Ex: Ponto aprovado após justificativa operacional de trânsito..."
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
