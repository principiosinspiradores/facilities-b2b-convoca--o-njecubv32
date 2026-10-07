import React, { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { EscalaRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Receipt, Calendar, Download } from 'lucide-react'

// Extrai o mês AAAA-MM de uma data ISO ou string de data
function extractYearMonth(dateStr: string): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 7)
}

// Retorna os últimos N meses no formato AAAA-MM ordenados do mais antigo para o mais recente (terminando no mês atual)
function getLastNMonths(n: number = 6): string[] {
  const months: string[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-based

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${yyyy}-${mm}`)
  }
  return months
}

// Formata AAAA-MM para rótulo amigável em pt-BR (ex: "Jan/26", "Out/26")
function formatMonthLabel(yearMonth: string, isCurrent: boolean = false): string {
  if (!yearMonth || yearMonth.length < 7) return yearMonth
  const [year, month] = yearMonth.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const monthNameRaw = date.toLocaleDateString('pt-BR', { month: 'short' })
  // Remove eventual ponto final (ex: "out.") e capitaliza a primeira letra
  const monthName = monthNameRaw.replace('.', '')
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  const shortYear = year.slice(2)
  const baseLabel = `${capitalized}/${shortYear}`
  return isCurrent ? `${baseLabel} (Atual)` : baseLabel
}

// Formata mês completo para o seletor (ex: "Outubro de 2026")
function formatMonthFullLabel(yearMonth: string): string {
  if (!yearMonth || yearMonth.length < 7) return yearMonth
  const [year, month] = yearMonth.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  const monthName = date.toLocaleDateString('pt-BR', { month: 'long' })
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  return `${capitalized} de ${year}`
}

export default function FaturamentoPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Mês corrente padrão no formato AAAA-MM (ex: 2026-10)
  const currentYearMonth = useMemo(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}`
  }, [])

  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonth)

  useEffect(() => {
    async function loadFaturamento() {
      setIsLoading(true)
      try {
        const records = await pb.collection('escalas').getFullList<EscalaRecord>({
          sort: '-data',
          expand: 'posto',
        })
        setEscalas(records)
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }
    loadFaturamento()
  }, [])

  // 1. Cálculo da evolução mensal a partir das escalas reais
  // Agrupar por mês (AAAA-MM) a soma de valor_diaria das escalas com status 'aceita' ou 'concluida'
  // Exibir os últimos 6 meses (incluindo meses vazios com valor 0), mês corrente rotulado "(Atual)"
  const { chartData, maxChartValue } = useMemo(() => {
    const last6 = getLastNMonths(6)
    const totalsByMonth: Record<string, number> = {}

    for (const m of last6) {
      totalsByMonth[m] = 0
    }

    for (const e of escalas) {
      if (e.status === 'aceita' || e.status === 'concluida') {
        const ym = extractYearMonth(e.data)
        if (totalsByMonth[ym] !== undefined) {
          totalsByMonth[ym] += Number(e.valor_diaria) || 0
        }
      }
    }

    const items = last6.map((ym) => {
      const isCurrent = ym === currentYearMonth
      const valor = totalsByMonth[ym] || 0
      return {
        key: ym,
        mes: formatMonthLabel(ym, isCurrent),
        valor,
        isCurrent,
      }
    })

    const maxVal = Math.max(...items.map((i) => i.valor), 0)

    return {
      chartData: items,
      maxChartValue: maxVal,
    }
  }, [escalas, currentYearMonth])

  // Lista de meses disponíveis nas escalas para o seletor (unir meses das escalas com o mês atual)
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    set.add(currentYearMonth)
    for (const e of escalas) {
      const ym = extractYearMonth(e.data)
      if (ym) set.add(ym)
    }
    // Ordenação decrescente (mais recente primeiro)
    return Array.from(set).sort().reverse()
  }, [escalas, currentYearMonth])

  // Escalas filtradas pelo período selecionado ('todos' ou AAAA-MM)
  const escalasFiltradas = useMemo(() => {
    if (selectedMonth === 'todos') {
      return escalas
    }
    return escalas.filter((e) => extractYearMonth(e.data) === selectedMonth)
  }, [escalas, selectedMonth])

  // Diárias agendadas vs executadas/concluídas do período filtrado
  const concluidasPeriodo = useMemo(() => {
    return escalasFiltradas.filter((e) => e.status === 'aceita' || e.status === 'concluida')
  }, [escalasFiltradas])

  const valorTotalFaturarPeriodo = useMemo(() => {
    return concluidasPeriodo.reduce((acc, e) => acc + (Number(e.valor_diaria) || 0), 0)
  }, [concluidasPeriodo])

  const totalExecutadasPeriodo = concluidasPeriodo.length

  // Totalizador da tabela (quantidade de diárias listadas + soma de valor_diaria)
  const { totalTabelaQtd, totalTabelaValor } = useMemo(() => {
    const totalQtd = escalasFiltradas.length
    const totalValor = escalasFiltradas.reduce((acc, e) => acc + (Number(e.valor_diaria) || 0), 0)
    return {
      totalTabelaQtd: totalQtd,
      totalTabelaValor: totalValor,
    }
  }, [escalasFiltradas])

  // Exportar CSV real com BOM (\uFEFF) para Excel pt-BR
  const handleExportCSV = () => {
    const headers = ['Posto', 'Data', 'Turno', 'Status', 'Valor']

    const rows = escalasFiltradas.map((e) => {
      const postoNome = e.expand?.posto?.nome || 'Posto não identificado'
      const dataFormatada = formatDateBR(e.data)
      const turno = `${e.turno_inicio || ''} às ${e.turno_fim || ''}`.trim()
      const status = e.status || ''
      // Formato numérico em pt-BR com vírgula para abrir nativamente no Excel sem virar data/string quebrada
      const valorFormatado = (Number(e.valor_diaria) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      // Escapa aspas e envolve em aspas campos de texto
      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`

      return [
        escapeCsv(postoNome),
        escapeCsv(dataFormatada),
        escapeCsv(turno),
        escapeCsv(status),
        escapeCsv(valorFormatado),
      ].join(';')
    })

    const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `faturamento-${selectedMonth}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            {isAdmin ? 'Faturamento Global & Cobrança B2B' : 'Faturamento Mensal da Empresa'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modelo B2B fechado sem cobrança de cartão no agendamento: fechamento mensal consolidado
            por diárias executadas.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={isLoading || escalasFiltradas.length === 0}
          className="text-xs"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Exportar Demonstrativo
        </Button>
      </div>

      {/* Cards de Métricas de Faturamento (refletem o período selecionado) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-primary/20 bg-primary/5">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">
              {selectedMonth === 'todos' ? 'Total a Faturar (Geral)' : 'Total a Faturar (Período)'}
            </div>
            <div className="text-3xl font-black text-primary mt-2 tabular-nums">
              {formatCurrencyBRL(valorTotalFaturarPeriodo)}
            </div>
            <p className="text-xs text-primary/80 mt-1">
              Consolidado de diárias aceitas e concluídas{' '}
              {selectedMonth === 'todos'
                ? '(histórico total)'
                : `(${formatMonthLabel(selectedMonth)})`}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Diárias Executadas
            </div>
            <div className="text-3xl font-black text-slate-800 mt-2 tabular-nums">
              {totalExecutadasPeriodo}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {selectedMonth === 'todos'
                ? 'Total de postos com cobertura efetivada'
                : `Postos com cobertura em ${formatMonthLabel(selectedMonth)}`}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-5">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Status da Fatura
            </div>
            <div className="mt-2">
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-sm py-1 px-3">
                Fechamento em Aberto (Fat. Mensal)
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Vencimento via boleto faturado para 30 dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Barras Sintético de Faturamento — dados reais dos últimos 6 meses */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">
            Evolução Mensal de Faturamento (R$)
          </CardTitle>
          <CardDescription>
            Comparativo consolidado de diárias cumpridas (status aceita ou concluída) nos últimos 6
            meses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-44 flex items-end justify-around gap-4 sm:gap-6 pt-6 border-b border-slate-100 pb-2">
            {chartData.map((bar) => {
              // Altura normalizada proporcional ao máximo; se max = 0, barra fica com altura mínima de 4px quando houver valor
              let alturaPct = '8%'
              if (maxChartValue > 0) {
                const ratio = bar.valor / maxChartValue
                alturaPct = bar.valor > 0 ? `${Math.max(Math.round(ratio * 90), 8)}%` : '4px'
              }

              return (
                <div
                  key={bar.key}
                  className="flex flex-col items-center flex-1 h-full justify-end group cursor-pointer"
                  onClick={() => setSelectedMonth(bar.key)}
                  title={`Clique para filtrar ${bar.mes}: ${formatCurrencyBRL(bar.valor)}`}
                >
                  <span className="text-[11px] font-bold text-primary mb-1 group-hover:scale-110 transition-transform">
                    {formatCurrencyBRL(bar.valor)}
                  </span>
                  <div
                    className={`w-full max-w-[48px] rounded-t-md transition-all shadow-sm ${
                      bar.valor > 0
                        ? 'bg-primary group-hover:bg-primary/90'
                        : 'bg-slate-200 group-hover:bg-slate-300'
                    } ${selectedMonth === bar.key ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    style={{ height: alturaPct }}
                  ></div>
                  <span
                    className={`text-xs mt-2 font-medium text-center ${
                      bar.isCurrent ? 'font-bold text-primary' : 'text-slate-500'
                    }`}
                  >
                    {bar.mes}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Diárias a Faturar com Filtro de Período */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Detalhamento das Diárias do Período
            </CardTitle>
            <CardDescription>Discriminação posto a posto para auditoria contábil.</CardDescription>
          </div>

          {/* Seletor de Período */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Período:
            </span>
            <Select value={selectedMonth} onValueChange={(val) => setSelectedMonth(val)}>
              <SelectTrigger className="w-[190px] h-9 text-xs">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os períodos</SelectItem>
                {availableMonths.map((ym) => (
                  <SelectItem key={ym} value={ym}>
                    {formatMonthFullLabel(ym)} {ym === currentYearMonth ? '(Atual)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : escalasFiltradas.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              Nenhuma diária encontrada para o período selecionado (
              {selectedMonth === 'todos' ? 'Geral' : formatMonthLabel(selectedMonth)}).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-3">Posto</th>
                    <th className="pb-3">Data</th>
                    <th className="pb-3">Turno</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Valor da Diária</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {escalasFiltradas.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-3 font-semibold text-slate-800">
                        {e.expand?.posto?.nome || 'Posto não informado'}
                      </td>
                      <td className="py-3 text-slate-600">{formatDateBR(e.data)}</td>
                      <td className="py-3 text-slate-600 text-xs">
                        {e.turno_inicio} às {e.turno_fim}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {e.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right font-bold text-primary tabular-nums">
                        {formatCurrencyBRL(e.valor_diaria)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Rodapé com totalizador */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-semibold text-slate-900">
                    <td
                      colSpan={3}
                      className="py-3 text-xs uppercase tracking-wider text-slate-600"
                    >
                      Total do Período ({totalTabelaQtd}{' '}
                      {totalTabelaQtd === 1 ? 'diária' : 'diárias'})
                    </td>
                    <td className="py-3 text-xs text-slate-500">
                      {concluidasPeriodo.length} faturáveis
                    </td>
                    <td className="py-3 text-right text-base font-black text-primary tabular-nums">
                      {formatCurrencyBRL(totalTabelaValor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
