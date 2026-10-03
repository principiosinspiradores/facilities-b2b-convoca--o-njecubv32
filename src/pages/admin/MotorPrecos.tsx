import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { PricingRuleRecord, HolidayRecord, PostoRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { Calculator, Plus, Trash2, Edit3, Calendar, MapPin, Clock } from 'lucide-react'

export default function MotorPrecosPage() {
  const [activeTab, setActiveTab] = useState<'base' | 'excecoes' | 'feriados'>('base')

  const [rules, setRules] = useState<PricingRuleRecord[]>([])
  const [holidays, setHolidays] = useState<HolidayRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal Regra Base
  const [modalBaseOpen, setModalBaseOpen] = useState(false)
  const [faixaHoras, setFaixaHoras] = useState(8)
  const [valorBase, setValorBase] = useState(180)

  // Modal Exceção de Posto
  const [modalExcecaoOpen, setModalExcecaoOpen] = useState(false)
  const [tipoExcecao, setTipoExcecao] = useState<'treinamento' | 'fim_semana' | 'feriado'>(
    'treinamento',
  )
  const [postoId, setPostoId] = useState('')
  const [valorExcecao, setValorExcecao] = useState(130)
  const [diasTreinamento, setDiasTreinamento] = useState(10)
  const [vigenciaInicio, setVigenciaInicio] = useState('2025-01-01')
  const [vigenciaFim, setVigenciaFim] = useState('2025-12-31')

  // Modal Feriado
  const [modalFeriadoOpen, setModalFeriadoOpen] = useState(false)
  const [feriadoData, setFeriadoData] = useState('')
  const [feriadoNome, setFeriadoNome] = useState('')
  const [feriadoTipo, setFeriadoTipo] = useState<'nacional' | 'municipal'>('nacional')
  const [feriadoCidade, setFeriadoCidade] = useState('')
  const [feriadoUf, setFeriadoUf] = useState('SP')

  const loadAll = async () => {
    setIsLoading(true)
    try {
      const [rList, hList, pList] = await Promise.all([
        pb.collection('pricing_rules').getFullList<PricingRuleRecord>({
          sort: 'faixa_horas,-created',
          expand: 'posto',
        }),
        pb.collection('holidays').getFullList<HolidayRecord>({
          sort: 'data',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          sort: 'nome',
        }),
      ])
      setRules(rList)
      setHolidays(hList)
      setPostos(pList)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar regras de precificação',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Salvar Regra Base
  const handleSaveBase = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await pb.collection('pricing_rules').create({
        tipo: 'base',
        faixa_horas: Number(faixaHoras),
        valor: Number(valorBase),
      })
      toast({ title: 'Faixa de horas criada!' })
      setModalBaseOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
    }
  }

  // Salvar Exceção
  const handleSaveExcecao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!postoId) {
      toast({ title: 'Selecione o posto', variant: 'destructive' })
      return
    }
    try {
      await pb.collection('pricing_rules').create({
        tipo: tipoExcecao,
        posto: postoId,
        valor: Number(valorExcecao),
        dias: tipoExcecao === 'treinamento' ? Number(diasTreinamento) : null,
        vigencia_inicio: vigenciaInicio ? new Date(vigenciaInicio).toISOString() : null,
        vigencia_fim: vigenciaFim ? new Date(vigenciaFim).toISOString() : null,
      })
      toast({ title: 'Exceção vinculada ao posto!' })
      setModalExcecaoOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao salvar exceção', variant: 'destructive' })
    }
  }

  // Salvar Feriado
  const handleSaveFeriado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feriadoData || !feriadoNome) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' })
      return
    }
    try {
      await pb.collection('holidays').create({
        data: new Date(feriadoData).toISOString(),
        nome: feriadoNome.trim(),
        tipo: feriadoTipo,
        cidade: feriadoTipo === 'municipal' ? feriadoCidade.trim() : null,
        uf: feriadoTipo === 'municipal' ? feriadoUf.trim() : null,
      })
      toast({ title: 'Feriado cadastrado com sucesso!' })
      setModalFeriadoOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao cadastrar feriado', variant: 'destructive' })
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Excluir esta regra de preço?')) return
    try {
      await pb.collection('pricing_rules').delete(id)
      toast({ title: 'Regra removida' })
      loadAll()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    if (!window.confirm('Excluir este feriado?')) return
    try {
      await pb.collection('holidays').delete(id)
      toast({ title: 'Feriado removido' })
      loadAll()
    } catch (err) {
      console.error(err)
    }
  }

  const baseRules = rules.filter((r) => r.tipo === 'base')
  const excecoes = rules.filter((r) => r.tipo !== 'base' && r.tipo !== 'multa_falta')

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-teal-700" />
            Motor de Cálculo de Diárias (3 Camadas)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie as tabelas base por carga horária, exceções por posto vigentes (treinamento,
            fins de semana) e calendário de feriados.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="base" className="text-sm font-semibold">
            1. Tabela Base por Horas
          </TabsTrigger>
          <TabsTrigger value="excecoes" className="text-sm font-semibold">
            2. Exceções por Posto (Vigências)
          </TabsTrigger>
          <TabsTrigger value="feriados" className="text-sm font-semibold">
            3. Feriados Nacionais & Municipais
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TABELA BASE */}
        <TabsContent value="base" className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500">
              Carga horária padrão definida no posto busca a faixa exata ou o fallback inferior mais
              próximo.
            </div>
            <Button
              onClick={() => setModalBaseOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar Faixa de Horas
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {baseRules.map((r) => (
              <Card key={r.id} className="border border-slate-200 bg-white">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase">
                      Faixa de Carga
                    </div>
                    <div className="text-2xl font-black text-slate-900">{r.faixa_horas} Horas</div>
                    <div className="text-xl font-bold text-teal-700 mt-1 tabular-nums">
                      {formatCurrencyBRL(r.valor)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteRule(r.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: EXCEÇÕES POR POSTO */}
        <TabsContent value="excecoes" className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500">
              Sobreposições de valor por posto: período probatório de treinamento, adicional de
              final de semana ou feriado.
            </div>
            <Button
              onClick={() => setModalExcecaoOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nova Exceção por Posto
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {excecoes.map((exc) => (
              <Card key={exc.id} className="border border-slate-200 bg-white">
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div>
                    <Badge className="bg-teal-50 text-teal-800 border-teal-200 text-xs uppercase mb-1">
                      {exc.tipo}
                    </Badge>
                    <CardTitle className="text-base font-bold text-slate-900">
                      {exc.expand?.posto?.nome || 'Posto Específico'}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteRule(exc.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="text-xs space-y-2">
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded border border-slate-100">
                    <span className="text-slate-500">Valor da Diária na Exceção:</span>
                    <span className="text-base font-bold text-teal-800">
                      {formatCurrencyBRL(exc.valor)}
                    </span>
                  </div>
                  {exc.tipo === 'treinamento' && (
                    <div className="text-slate-600">
                      <strong>Duração:</strong> {exc.dias || 10} dias iniciais
                    </div>
                  )}
                  <div className="text-slate-400 text-[11px]">
                    Vigência: {formatDateBR(exc.vigencia_inicio)} até{' '}
                    {formatDateBR(exc.vigencia_fim)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: FERIADOS */}
        <TabsContent value="feriados" className="space-y-4 pt-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-500">
              Feriados nacionais e municipais para cálculo de adicional de diária baseado na
              localidade do posto.
            </div>
            <Button
              onClick={() => setModalFeriadoOpen(true)}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Cadastrar Feriado
            </Button>
          </div>

          <Card className="border border-slate-200 bg-white">
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                      <th className="pb-3">Data</th>
                      <th className="pb-3">Nome do Feriado</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3">Abrangência (Cidade/UF)</th>
                      <th className="pb-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-3 font-semibold text-slate-800">
                          {formatDateBR(h.data)}
                        </td>
                        <td className="py-3 text-slate-900">{h.nome}</td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={
                              h.tipo === 'nacional'
                                ? 'bg-blue-50 text-blue-800'
                                : 'bg-purple-50 text-purple-800'
                            }
                          >
                            {h.tipo}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          {h.tipo === 'municipal' ? `${h.cidade}/${h.uf}` : 'Brasil (Nacional)'}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteHoliday(h.id)}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Base */}
      <Dialog open={modalBaseOpen} onOpenChange={setModalBaseOpen}>
        <DialogContent>
          <form onSubmit={handleSaveBase}>
            <DialogHeader>
              <DialogTitle>Nova Faixa de Horas (Tabela Base)</DialogTitle>
              <DialogDescription>
                Define a diária padrão para turnos dessa carga horária.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Carga Horária (h) *
                </label>
                <Input
                  type="number"
                  value={faixaHoras}
                  onChange={(e) => setFaixaHoras(Number(e.target.value))}
                  min={1}
                  max={24}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Valor da Diária (R$) *
                </label>
                <Input
                  type="number"
                  value={valorBase}
                  onChange={(e) => setValorBase(Number(e.target.value))}
                  min={1}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalBaseOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
                Salvar Faixa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Exceção Posto */}
      <Dialog open={modalExcecaoOpen} onOpenChange={setModalExcecaoOpen}>
        <DialogContent>
          <form onSubmit={handleSaveExcecao}>
            <DialogHeader>
              <DialogTitle>Nova Exceção de Preço por Posto</DialogTitle>
              <DialogDescription>
                Vincule regras pontuais de treinamento ou turnos diferenciados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Posto de Trabalho *
                </label>
                <Select value={postoId} onValueChange={setPostoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o posto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {postos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} ({p.funcao})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipo de Exceção *
                  </label>
                  <Select value={tipoExcecao} onValueChange={(v) => setTipoExcecao(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="treinamento">Treinamento</SelectItem>
                      <SelectItem value="fim_semana">Fim de Semana</SelectItem>
                      <SelectItem value="feriado">Feriado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Valor Diária (R$) *
                  </label>
                  <Input
                    type="number"
                    value={valorExcecao}
                    onChange={(e) => setValorExcecao(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              {tipoExcecao === 'treinamento' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Dias de Treinamento
                  </label>
                  <Input
                    type="number"
                    value={diasTreinamento}
                    onChange={(e) => setDiasTreinamento(Number(e.target.value))}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Início da Vigência
                  </label>
                  <Input
                    type="date"
                    value={vigenciaInicio}
                    onChange={(e) => setVigenciaInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Fim da Vigência
                  </label>
                  <Input
                    type="date"
                    value={vigenciaFim}
                    onChange={(e) => setVigenciaFim(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalExcecaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
                Salvar Exceção
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Feriado */}
      <Dialog open={modalFeriadoOpen} onOpenChange={setModalFeriadoOpen}>
        <DialogContent>
          <form onSubmit={handleSaveFeriado}>
            <DialogHeader>
              <DialogTitle>Cadastrar Feriado</DialogTitle>
              <DialogDescription>
                Feriados são confrontados com a data do turno e endereço do posto.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nome do Feriado *
                </label>
                <Input
                  value={feriadoNome}
                  onChange={(e) => setFeriadoNome(e.target.value)}
                  placeholder="Ex: Aniversário da Cidade"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Data *</label>
                  <Input
                    type="date"
                    value={feriadoData}
                    onChange={(e) => setFeriadoData(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tipo *</label>
                  <Select value={feriadoTipo} onValueChange={(v) => setFeriadoTipo(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nacional">Nacional</SelectItem>
                      <SelectItem value="municipal">Municipal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {feriadoTipo === 'municipal' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Cidade *
                    </label>
                    <Input
                      value={feriadoCidade}
                      onChange={(e) => setFeriadoCidade(e.target.value)}
                      placeholder="São Paulo"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">UF *</label>
                    <Input
                      value={feriadoUf}
                      onChange={(e) => setFeriadoUf(e.target.value)}
                      placeholder="SP"
                      maxLength={2}
                      required
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalFeriadoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white">
                Salvar Feriado
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
