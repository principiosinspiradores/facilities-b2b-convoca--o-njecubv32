import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  PostoRecord,
  UserRecord,
  EscalaRecord,
  ConvocacaoRecord,
  PontoRecord,
} from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'
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
import { toast } from '@/hooks/use-toast'
import {
  DollarSign,
  Building2,
  Users,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Briefcase,
  Clock,
  Calendar,
} from 'lucide-react'

interface ItemCusto {
  id: string
  escalaId?: string
  postoId: string
  postoNome: string
  data: string
  proId: string
  proNome: string
  tipoProfissional: 'fixa_mensal' | 'fixa_hora' | 'freelancer'
  horasTrabalhadas: number
  valorUnitarioOuHora: number
  custoTotal: number
  origemCalculo: string
}

export default function RelatorioCustoPostoPage() {
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [pontos, setPontos] = useState<PontoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filtros
  const [mesAnoFiltro, setMesAnoFiltro] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [postoFiltro, setPostoFiltro] = useState<string>('todos')
  const [proFiltro, setProFiltro] = useState<string>('todos')

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [postosRes, prosRes, escalasRes, convsRes, pontosRes] = await Promise.all([
        pb.collection('postos').getFullList<PostoRecord>({
          sort: 'nome',
          expand: 'pro_fixo',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: '-data',
          expand: 'posto',
        }),
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          filter: 'status = "aceita" || status = "coberta"',
          sort: '-created',
          expand: 'pro,escala',
        }),
        pb.collection('pontos').getFullList<PontoRecord>({
          sort: '-timestamp_real',
          expand: 'escala,pro',
        }),
      ])

      setPostos(postosRes)
      setPros(prosRes)
      setEscalas(escalasRes)
      setConvocacoes(convsRes)
      setPontos(pontosRes)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados do relatório',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Processamento e consolidação dos custos
  const { itensCustos, totalGeral, totalFixasMensais, totalFixasHoristas, totalFreelancers } =
    useMemo(() => {
      const list: ItemCusto[] = []

      // 1. Filtrar escalas pelo mês/ano selecionado (YYYY-MM)
      const escalasDoMes = escalas.filter((e) => {
        const dataEscala = e.data.slice(0, 7) // 'YYYY-MM'
        return !mesAnoFiltro || dataEscala === mesAnoFiltro
      })

      // Agrupamento de pontos por escala para calcular horas reais trabalhadas
      // chave: escalaId -> { chegada?: Date, saida?: Date }
      const pontosPorEscala: Record<string, { chegada?: Date; saida?: Date; proId?: string }> = {}
      for (const pt of pontos) {
        if (!pontosPorEscala[pt.escala]) {
          pontosPorEscala[pt.escala] = { proId: pt.pro }
        }
        const t = new Date(pt.timestamp_real)
        if (
          pt.tipo === 'chegada' &&
          (!pontosPorEscala[pt.escala].chegada || t < pontosPorEscala[pt.escala].chegada!)
        ) {
          pontosPorEscala[pt.escala].chegada = t
        }
        if (
          pt.tipo === 'saida' &&
          (!pontosPorEscala[pt.escala].saida || t > pontosPorEscala[pt.escala].saida!)
        ) {
          pontosPorEscala[pt.escala].saida = t
        }
      }

      // 2. Processar postos com Profissional Fixa Mensalista
      // Se o posto tem pro_fixo e tipo_remuneracao_fixa === 'mensal', computa o custo fixo mensal uma vez no mês do filtro
      const postosProcessadosFixaMensal = new Set<string>()

      postos.forEach((p) => {
        if (p.pro_fixo && p.tipo_remuneracao_fixa === 'mensal') {
          if (postoFiltro !== 'todos' && p.id !== postoFiltro) return
          if (proFiltro !== 'todos' && p.pro_fixo !== proFiltro) return

          const proObj = pros.find((u) => u.id === p.pro_fixo)
          const valorMensal = p.valor_remuneracao_fixa || 0

          list.push({
            id: `fixa-mensal-${p.id}`,
            postoId: p.id,
            postoNome: p.nome,
            data: `${mesAnoFiltro}-01`,
            proId: p.pro_fixo,
            proNome: proObj?.name || 'Profissional Fixa',
            tipoProfissional: 'fixa_mensal',
            horasTrabalhadas: (p.carga_horaria || 8) * 22, // Estimativa padrão mensal 22 dias
            valorUnitarioOuHora: valorMensal,
            custoTotal: valorMensal,
            origemCalculo: `Contrato Mensal Fixo (${formatCurrencyBRL(valorMensal)}/mês)`,
          })
          postosProcessadosFixaMensal.add(p.id)
        }
      })

      // 3. Processar escalas realizadas de cada posto
      escalasDoMes.forEach((escala) => {
        const posto = postos.find((p) => p.id === escala.posto)
        if (!posto) return

        if (postoFiltro !== 'todos' && posto.id !== postoFiltro) return

        // Convocação aceita desta escala
        const conv = convocacoes.find(
          (c) => c.escala === escala.id && (c.status === 'aceita' || c.status === 'coberta'),
        )
        if (!conv) return

        const proId = conv.pro
        if (proFiltro !== 'todos' && proId !== proFiltro) return

        const proObj = pros.find((u) => u.id === proId)
        const isProFixo = posto.pro_fixo && posto.pro_fixo === proId

        // Caso A: Posto com Pro Fixa Horista (horas do ponto × valor da hora da fixa)
        if (isProFixo && posto.tipo_remuneracao_fixa === 'por_hora') {
          const valorHora = posto.valor_remuneracao_fixa || 25
          const infoPonto = pontosPorEscala[escala.id]

          let horas = posto.carga_horaria || 8
          let origem = `Carga horária padrão (${horas}h × ${formatCurrencyBRL(valorHora)}/h)`

          if (infoPonto?.chegada && infoPonto?.saida) {
            const diffMs = infoPonto.saida.getTime() - infoPonto.chegada.getTime()
            const horasReais = Number((diffMs / (1000 * 60 * 60)).toFixed(1))
            if (horasReais > 0 && horasReais <= 24) {
              horas = horasReais
              origem = `Ponto real (${horas}h apuradas × ${formatCurrencyBRL(valorHora)}/h)`
            }
          }

          const custo = horas * valorHora

          list.push({
            id: `escala-${escala.id}`,
            escalaId: escala.id,
            postoId: posto.id,
            postoNome: posto.nome,
            data: escala.data.slice(0, 10),
            proId: proId,
            proNome: proObj?.name || 'Profissional',
            tipoProfissional: 'fixa_hora',
            horasTrabalhadas: horas,
            valorUnitarioOuHora: valorHora,
            custoTotal: custo,
            origemCalculo: origem,
          })
        }
        // Caso B: Se for fixa mensal, o valor total já foi lançado acima de forma consolidada no mês.
        else if (isProFixo && posto.tipo_remuneracao_fixa === 'mensal') {
          // Já incluso no resumo mensal
        }
        // Caso C: Freelancer (motor de 3 camadas por diária)
        else {
          const vDiaria = conv.valor_diaria || escala.valor_diaria || 180
          const horas = posto.carga_horaria || 8

          list.push({
            id: `escala-${escala.id}`,
            escalaId: escala.id,
            postoId: posto.id,
            postoNome: posto.nome,
            data: escala.data.slice(0, 10),
            proId: proId,
            proNome: proObj?.name || 'Freelancer',
            tipoProfissional: 'freelancer',
            horasTrabalhadas: horas,
            valorUnitarioOuHora: vDiaria,
            custoTotal: vDiaria,
            origemCalculo: conv.regra_aplicada || 'Motor de 3 Camadas',
          })
        }
      })

      // Totais consolidados
      let totalFixasM = 0
      let totalFixasH = 0
      let totalFree = 0

      list.forEach((it) => {
        if (it.tipoProfissional === 'fixa_mensal') totalFixasM += it.custoTotal
        else if (it.tipoProfissional === 'fixa_hora') totalFixasH += it.custoTotal
        else totalFree += it.custoTotal
      })

      return {
        itensCustos: list,
        totalGeral: totalFixasM + totalFixasH + totalFree,
        totalFixasMensais: totalFixasM,
        totalFixasHoristas: totalFixasH,
        totalFreelancers: totalFree,
      }
    }, [postos, pros, escalas, convocacoes, pontos, mesAnoFiltro, postoFiltro, proFiltro])

  // Exportação CSV do Relatório
  const handleExportCSV = () => {
    if (itensCustos.length === 0) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' })
      return
    }

    const headers = [
      'Posto de Trabalho',
      'Data / Referência',
      'Profissional',
      'Modelo Operacional',
      'Horas Computadas',
      'Valor Unitário (Diária/Hora/Mensal)',
      'Custo Operacional Total (R$)',
      'Regra / Origem do Cálculo',
    ]

    const rows = itensCustos.map((it) => [
      `"${it.postoNome.replace(/"/g, '""')}"`,
      it.data,
      `"${it.proNome.replace(/"/g, '""')}"`,
      it.tipoProfissional === 'fixa_mensal'
        ? 'Fixa Mensalista'
        : it.tipoProfissional === 'fixa_hora'
          ? 'Fixa por Hora (Ponto)'
          : 'Freelancer (Motor 3 Camadas)',
      it.horasTrabalhadas,
      it.valorUnitarioOuHora.toFixed(2),
      it.custoTotal.toFixed(2),
      `"${it.origemCalculo.replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `relatorio_custo_posto_${mesAnoFiltro}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Relatório CSV exportado',
      description: `${itensCustos.length} lançamentos consolidados com sucesso.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            Relatório de Custo Mensal por Posto
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Visão gerencial e operacional de custos por posto separando fixas (mensalistas e por
            hora via ponto) e freelancers (motor de diárias).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadData} variant="outline" size="sm" className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Atualizar
          </Button>
          <Button onClick={handleExportCSV} className="text-xs font-semibold">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV Gerencial
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Consolidadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Geral */}
        <Card className="border border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Custo Total Operacional
            </div>
            <div className="text-2xl font-black text-slate-900">
              {formatCurrencyBRL(totalGeral)}
            </div>
            <div className="text-[11px] text-slate-500">Mês {mesAnoFiltro}</div>
          </CardContent>
        </Card>

        {/* Fixas Mensalistas */}
        <Card className="border border-primary/20 bg-primary/5 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              Fixas Mensalistas
            </div>
            <div className="text-2xl font-black text-primary">
              {formatCurrencyBRL(totalFixasMensais)}
            </div>
            <div className="text-[11px] text-primary/80">Contratos fixos mensais</div>
          </CardContent>
        </Card>

        {/* Fixas por Hora */}
        <Card className="border border-indigo-200 bg-indigo-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-semibold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Fixas por Hora (Ponto)
            </div>
            <div className="text-2xl font-black text-indigo-900">
              {formatCurrencyBRL(totalFixasHoristas)}
            </div>
            <div className="text-[11px] text-indigo-700">Horas reais apuradas do ponto</div>
          </CardContent>
        </Card>

        {/* Freelancers */}
        <Card className="border border-amber-200 bg-amber-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              Freelancers (Motor 3 Camadas)
            </div>
            <div className="text-2xl font-black text-amber-900">
              {formatCurrencyBRL(totalFreelancers)}
            </div>
            <div className="text-[11px] text-amber-700">Diárias avulsas cobertas</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border border-slate-200 bg-white">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Mês/Ano */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Mês de Competência
              </label>
              <Input
                type="month"
                value={mesAnoFiltro}
                onChange={(e) => setMesAnoFiltro(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Posto */}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Filtrar Posto
              </label>
              <Select value={postoFiltro} onValueChange={setPostoFiltro}>
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
                Filtrar Profissional
              </label>
              <Select value={proFiltro} onValueChange={setProFiltro}>
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
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada de Custos */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : itensCustos.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-white">
          <CardContent className="space-y-3">
            <DollarSign className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">
              Nenhum custo registrado para este período
            </h3>
            <p className="text-xs text-slate-400">
              Altere o mês de competência ou o filtro de postos para visualizar os lançamentos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>
              Lançamentos: <strong>{itensCustos.length}</strong> itens computados
            </span>
            <span className="font-bold text-slate-900">
              Subtotal do Período: {formatCurrencyBRL(totalGeral)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Posto</th>
                  <th className="p-3">Profissional</th>
                  <th className="p-3">Modelo / Tipo</th>
                  <th className="p-3">Horas</th>
                  <th className="p-3">Valor Unitário</th>
                  <th className="p-3">Custo Total</th>
                  <th className="p-3">Regra de Apuração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itensCustos.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">{formatDateBR(it.data)}</td>
                    <td className="p-3 font-medium text-slate-900">{it.postoNome}</td>
                    <td className="p-3 font-medium text-slate-800">{it.proNome}</td>
                    <td className="p-3">
                      {it.tipoProfissional === 'fixa_mensal' ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                          Fixa Mensal
                        </Badge>
                      ) : it.tipoProfissional === 'fixa_hora' ? (
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px]">
                          Fixa por Hora
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                          Freelancer
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 font-medium text-slate-700">{it.horasTrabalhadas}h</td>
                    <td className="p-3 text-slate-600">
                      {formatCurrencyBRL(it.valorUnitarioOuHora)}
                      {it.tipoProfissional === 'fixa_hora' && '/h'}
                      {it.tipoProfissional === 'fixa_mensal' && '/mês'}
                    </td>
                    <td className="p-3 font-bold text-primary text-sm">
                      {formatCurrencyBRL(it.custoTotal)}
                    </td>
                    <td
                      className="p-3 text-slate-500 max-w-[220px] truncate"
                      title={it.origemCalculo}
                    >
                      {it.origemCalculo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
