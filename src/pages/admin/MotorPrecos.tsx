import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { PricingRuleRecord, HolidayRecord, HolidayTipo, PostoRecord } from '@/types/facilities'
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
import {
  Calculator,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  Layers,
  ArrowRight,
  Info,
  Loader2,
  Building2,
  UserCheck,
  Tag,
  AlertTriangle,
  DownloadCloud,
} from 'lucide-react'

const TIPO_EXCECAO_LABELS: Record<string, string> = {
  treinamento: 'Treinamento',
  fim_semana: 'Fim de Semana',
  feriado: 'Feriado',
}

const TIPO_EXCECAO_BADGES: Record<string, string> = {
  treinamento: 'bg-amber-50 text-amber-800 border-amber-200',
  fim_semana: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  feriado: 'bg-rose-50 text-rose-800 border-rose-200',
}

export default function MotorPrecosPage() {
  const [activeTab, setActiveTab] = useState<'base' | 'excecoes' | 'feriados'>('base')

  const [rules, setRules] = useState<PricingRuleRecord[]>([])
  const [holidays, setHolidays] = useState<HolidayRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modal Regra Base
  const [modalBaseOpen, setModalBaseOpen] = useState(false)
  const [editingBaseId, setEditingBaseId] = useState<string | null>(null)
  const [faixaHoras, setFaixaHoras] = useState(8)
  const [valorBase, setValorBase] = useState(180)

  // Modal Exceção de Posto
  const [modalExcecaoOpen, setModalExcecaoOpen] = useState(false)
  const [editingExcecaoId, setEditingExcecaoId] = useState<string | null>(null)
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
  const [editingFeriadoId, setEditingFeriadoId] = useState<string | null>(null)
  const [feriadoData, setFeriadoData] = useState('')
  const [feriadoNome, setFeriadoNome] = useState('')
  const [feriadoTipo, setFeriadoTipo] = useState<HolidayTipo>('nacional')
  const [feriadoCidade, setFeriadoCidade] = useState('')
  const [feriadoUf, setFeriadoUf] = useState('SP')

  // Importação BrasilAPI
  const [modalImportarOpen, setModalImportarOpen] = useState(false)
  const [anoImportacao, setAnoImportacao] = useState(new Date().getFullYear().toString())
  const [isImporting, setIsImporting] = useState(false)

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

  // Abertura de Modal Base para Criação ou Edição
  const handleOpenCreateBase = () => {
    setEditingBaseId(null)
    setFaixaHoras(8)
    setValorBase(180)
    setModalBaseOpen(true)
  }

  const handleOpenEditBase = (rule: PricingRuleRecord) => {
    setEditingBaseId(rule.id)
    setFaixaHoras(rule.faixa_horas || 8)
    setValorBase(rule.valor)
    setModalBaseOpen(true)
  }

  // Salvar Regra Base (Criar ou Atualizar)
  const handleSaveBase = async (e: React.FormEvent) => {
    e.preventDefault()
    const horasNum = Number(faixaHoras)
    const valorNum = Number(valorBase)

    if (horasNum <= 0 || isNaN(horasNum)) {
      toast({
        title: 'Carga horária inválida',
        description: 'Informe uma carga horária válida maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (valorNum <= 0 || isNaN(valorNum)) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero.',
        variant: 'destructive',
      })
      return
    }

    // Validação: impedir duas faixas com a mesma carga horária
    const duplicada = rules.find(
      (r) => r.tipo === 'base' && r.id !== editingBaseId && Number(r.faixa_horas) === horasNum,
    )

    if (duplicada) {
      toast({
        title: 'Carga horária já cadastrada',
        description: `Já existe uma faixa de ${horasNum}h (${formatCurrencyBRL(duplicada.valor)}). Edite a existente ou use outra carga horária.`,
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingBaseId) {
        await pb.collection('pricing_rules').update(editingBaseId, {
          faixa_horas: horasNum,
          valor: valorNum,
        })
        toast({
          title: 'Faixa de horas atualizada!',
          description: `Faixa de ${horasNum}h alterada para ${formatCurrencyBRL(valorNum)}.`,
        })
      } else {
        await pb.collection('pricing_rules').create({
          tipo: 'base',
          faixa_horas: horasNum,
          valor: valorNum,
        })
        toast({
          title: 'Faixa de horas criada!',
          description: `Nova faixa de ${horasNum}h com diária de ${formatCurrencyBRL(valorNum)}.`,
        })
      }
      setModalBaseOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar faixa de horas',
        description: 'Não foi possível salvar o registro.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Abertura de Modal Exceção para Criação ou Edição
  const handleOpenCreateExcecao = () => {
    setEditingExcecaoId(null)
    setTipoExcecao('treinamento')
    setPostoId(postos[0]?.id || '')
    setValorExcecao(130)
    setDiasTreinamento(10)
    setVigenciaInicio(new Date().toISOString().slice(0, 10))
    setVigenciaFim(new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10))
    setModalExcecaoOpen(true)
  }

  const handleOpenEditExcecao = (exc: PricingRuleRecord) => {
    setEditingExcecaoId(exc.id)
    setTipoExcecao((exc.tipo as 'treinamento' | 'fim_semana' | 'feriado') || 'treinamento')
    setPostoId(exc.posto || '')
    setValorExcecao(exc.valor)
    setDiasTreinamento(exc.dias || 10)
    setVigenciaInicio(exc.vigencia_inicio ? exc.vigencia_inicio.slice(0, 10) : '')
    setVigenciaFim(exc.vigencia_fim ? exc.vigencia_fim.slice(0, 10) : '')
    setModalExcecaoOpen(true)
  }

  // Salvar Exceção (Criar ou Atualizar)
  const handleSaveExcecao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!postoId) {
      toast({
        title: 'Selecione o posto',
        description: 'É necessário vincular a exceção a um posto de trabalho.',
        variant: 'destructive',
      })
      return
    }

    const valorNum = Number(valorExcecao)
    if (valorNum <= 0 || isNaN(valorNum)) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero para a diária da exceção.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        tipo: tipoExcecao,
        posto: postoId,
        valor: valorNum,
        dias: tipoExcecao === 'treinamento' ? Number(diasTreinamento) || 10 : null,
        vigencia_inicio: vigenciaInicio ? new Date(vigenciaInicio).toISOString() : null,
        vigencia_fim: vigenciaFim ? new Date(vigenciaFim).toISOString() : null,
      }

      if (editingExcecaoId) {
        await pb.collection('pricing_rules').update(editingExcecaoId, payload)
        toast({
          title: 'Exceção atualizada!',
          description: `Regra de ${TIPO_EXCECAO_LABELS[tipoExcecao] || tipoExcecao} atualizada com sucesso.`,
        })
      } else {
        await pb.collection('pricing_rules').create(payload)
        toast({
          title: 'Exceção vinculada ao posto!',
          description: `Regra de ${TIPO_EXCECAO_LABELS[tipoExcecao] || tipoExcecao} cadastrada com sucesso.`,
        })
      }
      setModalExcecaoOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar exceção',
        description: 'Não foi possível salvar o registro de exceção.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Lista de localidades extraídas dos postos cadastrados
  const postosLocalidades = React.useMemo(() => {
    const list: Array<{ cidade: string; uf: string }> = []
    const seen = new Set<string>()

    for (const p of postos) {
      const cid = (p.endereco?.cidade || '').trim()
      const uf = (p.endereco?.uf || '').trim().toUpperCase()
      if (cid && uf) {
        const key = `${cid}__${uf}`
        if (!seen.has(key)) {
          seen.add(key)
          list.push({ cidade: cid, uf })
        }
      }
    }
    return list
  }, [postos])

  const postosUfs = React.useMemo(() => {
    const ufs = new Set<string>()
    for (const p of postos) {
      const uf = (p.endereco?.uf || '').trim().toUpperCase()
      if (uf) ufs.add(uf)
    }
    return Array.from(ufs).sort()
  }, [postos])

  // Abertura de Modal Feriado para Criação ou Edição
  const handleOpenCreateFeriado = () => {
    setEditingFeriadoId(null)
    setFeriadoData(new Date().toISOString().slice(0, 10))
    setFeriadoNome('')
    setFeriadoTipo('nacional')

    // Pré-preenchimento automático se houver apenas uma cidade/UF nos postos
    if (postosLocalidades.length === 1) {
      setFeriadoCidade(postosLocalidades[0].cidade)
      setFeriadoUf(postosLocalidades[0].uf)
    } else if (postosUfs.length === 1) {
      setFeriadoCidade('')
      setFeriadoUf(postosUfs[0])
    } else {
      setFeriadoCidade('')
      setFeriadoUf('SP')
    }
    setModalFeriadoOpen(true)
  }

  const handleOpenEditFeriado = (holiday: HolidayRecord) => {
    setEditingFeriadoId(holiday.id)
    setFeriadoData(holiday.data ? holiday.data.slice(0, 10) : '')
    setFeriadoNome(holiday.nome || '')
    setFeriadoTipo(holiday.tipo || 'nacional')
    setFeriadoCidade(holiday.cidade || '')
    setFeriadoUf(holiday.uf || 'SP')
    setModalFeriadoOpen(true)
  }

  // Troca de tipo no modal com auto-preenchimento
  const handleTipoFeriadoChange = (novoTipo: HolidayTipo) => {
    setFeriadoTipo(novoTipo)
    if (novoTipo === 'estadual') {
      if (!feriadoUf && postosUfs.length > 0) {
        setFeriadoUf(postosUfs[0])
      }
    } else if (novoTipo === 'municipal') {
      if (postosLocalidades.length === 1 && !feriadoCidade) {
        setFeriadoCidade(postosLocalidades[0].cidade)
        setFeriadoUf(postosLocalidades[0].uf)
      } else if (!feriadoUf && postosUfs.length > 0) {
        setFeriadoUf(postosUfs[0])
      }
    }
  }

  // Importar Feriados Nacionais via BrasilAPI
  const handleImportarFeriadosNacionais = async () => {
    const anoNum = parseInt(anoImportacao, 10)
    if (isNaN(anoNum) || anoNum < 1900 || anoNum > 2199) {
      toast({
        title: 'Ano inválido',
        description: 'Informe um ano válido entre 1900 e 2199.',
        variant: 'destructive',
      })
      return
    }

    setIsImporting(true)
    try {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoNum}`)
      if (!response.ok) {
        throw new Error(`BrasilAPI retornou status ${response.status}`)
      }
      const data: Array<{ date: string; name: string; type?: string }> = await response.json()

      if (!Array.isArray(data) || data.length === 0) {
        toast({
          title: 'Nenhum feriado retornado',
          description: `A BrasilAPI não retornou feriados para o ano ${anoNum}.`,
          variant: 'destructive',
        })
        setIsImporting(false)
        return
      }

      // Buscar feriados existentes no ano para evitar duplicidade por nome + data
      const existingYearHolidays = await pb.collection('holidays').getFullList<HolidayRecord>({
        filter: `data ~ "${anoNum}"`,
      })

      const isDuplicate = (hDate: string, hName: string) => {
        const normName = hName.trim().toLowerCase()
        return existingYearHolidays.some((ex) => {
          const exDate = (ex.data || '').slice(0, 10)
          const exNormName = (ex.nome || '').trim().toLowerCase()
          return exDate === hDate && exNormName === normName
        })
      }

      let criados = 0
      let ignorados = 0

      for (const item of data) {
        const itemDate = (item.date || '').slice(0, 10)
        const itemName = (item.name || '').trim()
        if (!itemDate || !itemName) continue

        if (isDuplicate(itemDate, itemName)) {
          ignorados++
          continue
        }

        await pb.collection('holidays').create({
          data: `${itemDate} 00:00:00.000Z`,
          nome: itemName,
          tipo: 'nacional',
          cidade: null,
          uf: null,
        })
        criados++
        // Atualiza a lista em memória local para não duplicar se a própria API trouxer repetições
        existingYearHolidays.push({
          id: 'temp',
          data: `${itemDate} 00:00:00.000Z`,
          nome: itemName,
          tipo: 'nacional',
          created: '',
          updated: '',
        })
      }

      toast({
        title: 'Importação concluída!',
        description: `${criados} feriado(s) nacional(is) importado(s) para ${anoNum}. ${ignorados} já existiam e foram mantidos.`,
      })
      setModalImportarOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Falha na importação',
        description: 'Não foi possível buscar os feriados na BrasilAPI. Verifique sua conexão.',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }

  // Salvar Feriado (Criar ou Atualizar)
  const handleSaveFeriado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feriadoData || !feriadoNome.trim()) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Data e nome do feriado são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    if (feriadoTipo === 'municipal' && (!feriadoCidade.trim() || !feriadoUf.trim())) {
      toast({
        title: 'Cidade e UF obrigatórios',
        description: 'Para feriado municipal, informe cidade e UF.',
        variant: 'destructive',
      })
      return
    }

    if (feriadoTipo === 'estadual' && !feriadoUf.trim()) {
      toast({
        title: 'UF obrigatória',
        description: 'Para feriado estadual, informe a UF do estado.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const cleanDate = feriadoData.slice(0, 10)
      const payload: Record<string, unknown> = {
        data: `${cleanDate} 00:00:00.000Z`,
        nome: feriadoNome.trim(),
        tipo: feriadoTipo,
        cidade: feriadoTipo === 'municipal' ? feriadoCidade.trim() : null,
        uf:
          feriadoTipo === 'municipal' || feriadoTipo === 'estadual'
            ? feriadoUf.trim().toUpperCase()
            : null,
      }

      if (editingFeriadoId) {
        await pb.collection('holidays').update(editingFeriadoId, payload)
        toast({
          title: 'Feriado atualizado!',
          description: `Feriado "${feriadoNome.trim()}" atualizado com sucesso.`,
        })
      } else {
        await pb.collection('holidays').create(payload)
        toast({
          title: 'Feriado cadastrado!',
          description: `Feriado "${feriadoNome.trim()}" cadastrado com sucesso.`,
        })
      }
      setModalFeriadoOpen(false)
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar feriado',
        description: 'Não foi possível salvar o registro de feriado.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRule = async (id: string, label: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir esta regra (${label})?`)) return
    try {
      await pb.collection('pricing_rules').delete(id)
      toast({ title: 'Regra removida com sucesso' })
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir regra',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteHoliday = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o feriado "${nome}"?`)) return
    try {
      await pb.collection('holidays').delete(id)
      toast({ title: 'Feriado removido com sucesso' })
      loadAll()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao excluir feriado',
        variant: 'destructive',
      })
    }
  }

  const baseRules = rules.filter((r) => r.tipo === 'base')
  const excecoes = rules.filter((r) => r.tipo !== 'base' && r.tipo !== 'multa_falta')

  return (
    <div className="space-y-6">
      {/* Título da tela */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-primary" />
            Motor de Cálculo de Diárias
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie as tabelas base por carga horária, exceções por posto vigentes (treinamento,
            fins de semana, feriados) e o calendário de feriados.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Badge
            variant="outline"
            className="bg-primary/5 text-primary border-primary/20 text-xs px-3 py-1 font-semibold"
          >
            Modo Edição Ativo (Admin)
          </Badge>
        </div>
      </div>

      {/* 4. Painel explicativo da ordem de prioridade do motor */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-white to-slate-50 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-primary/10 bg-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Ordem de Decisão do Motor de Precificação
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Como as 5 camadas disputam o valor final da diária para cada convocação
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-primary/30 text-primary bg-white text-[11px] self-start sm:self-auto font-medium"
            >
              Hierarquia de Sobreposição
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
            {/* Camada 1 */}
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                  1º Prioridade
                </span>
                <Building2 className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">
                  Pro Fixo do Posto
                </h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Mensal contratada ou por hora trabalhada. Não passa pelo motor de freelance.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                Configurado em: <strong className="text-slate-700">Cadastro do Posto</strong>
              </div>
            </div>

            {/* Camada 2 */}
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  2º Prioridade
                </span>
                <UserCheck className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Pro em Teste</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Profissional com status em teste recebe ajuda de custo fixa configurada.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                Configurado em: <strong className="text-slate-700">Gate de Pros (Pro)</strong>
              </div>
            </div>

            {/* Camada 3 */}
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground">
                  3º Prioridade
                </span>
                <Tag className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Valor Negociado</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Tarifa acordada individualmente com o profissional. Sobrepõe as camadas do posto.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                Configurado em:{' '}
                <strong className="text-slate-700">Gate de Pros (Precificação)</strong>
              </div>
            </div>

            {/* Camada 4 */}
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/80 text-primary-foreground">
                  4º Prioridade
                </span>
                <AlertTriangle className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">Exceção do Posto</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Treinamento probatório, adicional de fim de semana ou adicional de feriado.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                Configurado em: <strong className="text-slate-700">Nesta Tela (Aba 2)</strong>
              </div>
            </div>

            {/* Camada 5 */}
            <div className="p-3 rounded-lg bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-600 text-white">
                  5º Base
                </span>
                <Clock className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 leading-tight">
                  Tabela Base de Horas
                </h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Faixa exata da carga horária do turno ou fallback inferior mais próximo.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                Configurado em: <strong className="text-slate-700">Nesta Tela (Aba 1)</strong>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-primary/5 text-slate-900 p-2.5 rounded-lg text-xs border border-primary/20">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Onde cada configuração vive:</strong> regras de posto (tabela base, exceções e
              feriados) são gerenciadas nesta tela e no cadastro do posto. Os valores individuais de
              cada profissional (ajuda de custo em período de teste e valor negociado) são
              configurados no <strong>Gate de Pros (Precificação Admin)</strong>.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navegação por Abas */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="base" className="text-sm font-semibold">
            1. Tabela Base por Horas ({baseRules.length})
          </TabsTrigger>
          <TabsTrigger value="excecoes" className="text-sm font-semibold">
            2. Exceções por Posto ({excecoes.length})
          </TabsTrigger>
          <TabsTrigger value="feriados" className="text-sm font-semibold">
            3. Feriados Nacionais, Estaduais & Municipais ({holidays.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TABELA BASE */}
        <TabsContent value="base" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              Carga horária padrão definida no posto busca a faixa exata ou o fallback inferior mais
              próximo. Você pode <strong>editar</strong> o valor e as horas de cada faixa
              diretamente.
            </div>
            <Button
              onClick={handleOpenCreateBase}
              className="text-xs shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Adicionar Faixa de Horas
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Carregando faixas base...
            </div>
          ) : baseRules.length === 0 ? (
            <Card className="border border-dashed border-slate-200 bg-white">
              <CardContent className="pt-8 pb-8 text-center text-slate-500 text-sm">
                Nenhuma faixa de horas cadastrada no momento. Clique em "Adicionar Faixa de Horas"
                para criar a primeira.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {baseRules.map((r) => (
                <Card
                  key={r.id}
                  className="border border-slate-200 bg-white hover:border-primary/30 transition-colors"
                >
                  <CardContent className="pt-5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Faixa de Carga
                      </div>
                      <div className="text-2xl font-black text-slate-900">
                        {r.faixa_horas} Horas
                      </div>
                      <div className="text-xl font-bold text-primary mt-1 tabular-nums">
                        {formatCurrencyBRL(r.valor)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar faixa"
                        onClick={() => handleOpenEditBase(r)}
                        className="text-slate-500 hover:text-primary hover:bg-primary/5"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir faixa"
                        onClick={() =>
                          handleDeleteRule(
                            r.id,
                            `${r.faixa_horas}h - ${formatCurrencyBRL(r.valor)}`,
                          )
                        }
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: EXCEÇÕES POR POSTO */}
        <TabsContent value="excecoes" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              Sobreposições de valor vinculadas a postos de trabalho (treinamento probatório,
              adicional de fim de semana ou feriado).
            </div>
            <Button
              onClick={handleOpenCreateExcecao}
              className="text-xs shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nova Exceção por Posto
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Carregando exceções...
            </div>
          ) : excecoes.length === 0 ? (
            <Card className="border border-dashed border-slate-200 bg-white">
              <CardContent className="pt-8 pb-8 text-center text-slate-500 text-sm">
                Nenhuma exceção por posto cadastrada. Clique em "Nova Exceção por Posto" para
                configurar regras especiais de treinamento, fim de semana ou feriado.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {excecoes.map((exc) => {
                const tipoBadgeClass =
                  TIPO_EXCECAO_BADGES[exc.tipo] || 'bg-slate-50 text-slate-800 border-slate-200'
                const tipoLabel = TIPO_EXCECAO_LABELS[exc.tipo] || exc.tipo

                return (
                  <Card
                    key={exc.id}
                    className="border border-slate-200 bg-white hover:border-primary/30 transition-colors"
                  >
                    <CardHeader className="pb-3 flex flex-row items-start justify-between">
                      <div>
                        <Badge className={`${tipoBadgeClass} text-xs font-semibold mb-1`}>
                          {tipoLabel}
                        </Badge>
                        <CardTitle className="text-base font-bold text-slate-900">
                          {exc.expand?.posto?.nome || 'Posto não identificado'}
                        </CardTitle>
                        {exc.expand?.posto?.funcao && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Função: {exc.expand.posto.funcao}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar exceção"
                          onClick={() => handleOpenEditExcecao(exc)}
                          className="text-slate-500 hover:text-primary hover:bg-primary/5"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir exceção"
                          onClick={() =>
                            handleDeleteRule(
                              exc.id,
                              `${tipoLabel} - ${exc.expand?.posto?.nome || 'Posto'} (${formatCurrencyBRL(exc.valor)})`,
                            )
                          }
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2">
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <span className="text-slate-500">Valor da Diária na Exceção:</span>
                        <span className="text-base font-bold text-primary tabular-nums">
                          {formatCurrencyBRL(exc.valor)}
                        </span>
                      </div>
                      {exc.tipo === 'treinamento' && (
                        <div className="text-slate-600">
                          <strong>Duração do treinamento:</strong> {exc.dias || 10} dias iniciais
                        </div>
                      )}
                      <div className="text-slate-500 text-[11px]">
                        <strong>Vigência:</strong>{' '}
                        {exc.vigencia_inicio ? formatDateBR(exc.vigencia_inicio) : 'Indeterminada'}{' '}
                        até {exc.vigencia_fim ? formatDateBR(exc.vigencia_fim) : 'Indeterminada'}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 3: FERIADOS */}
        <TabsContent value="feriados" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              Feriados nacionais, estaduais e municipais confrontados com a data do turno e a
              localidade do posto.
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setModalImportarOpen(true)}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs shrink-0"
              >
                <DownloadCloud className="w-4 h-4 mr-1.5 text-primary" />
                Importar Feriados Nacionais
              </Button>
              <Button
                onClick={handleOpenCreateFeriado}
                className="text-xs shrink-0"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Cadastrar Feriado
              </Button>
            </div>
          </div>

          <Card className="border border-slate-200 bg-white">
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  Carregando feriados...
                </div>
              ) : holidays.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Nenhum feriado cadastrado. Clique em "Cadastrar Feriado" para adicionar datas
                  comemorativas.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                        <th className="pb-3">Data</th>
                        <th className="pb-3">Nome do Feriado</th>
                        <th className="pb-3">Tipo</th>
                        <th className="pb-3">Abrangência (Cidade/UF)</th>
                        <th className="pb-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {holidays.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 font-semibold text-slate-800 tabular-nums">
                            {formatDateBR(h.data)}
                          </td>
                          <td className="py-3 text-slate-900 font-medium">{h.nome}</td>
                          <td className="py-3">
                            <Badge
                              variant="outline"
                              className={
                                h.tipo === 'nacional'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : h.tipo === 'estadual'
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }
                            >
                              {h.tipo === 'nacional'
                                ? 'Nacional'
                                : h.tipo === 'estadual'
                                  ? 'Estadual'
                                  : 'Municipal'}
                            </Badge>
                          </td>
                          <td className="py-3 text-xs text-slate-600 font-medium">
                            {h.tipo === 'estadual'
                              ? `UF: ${h.uf || '—'}`
                              : h.tipo === 'municipal'
                                ? `${h.cidade || '—'}/${h.uf || '—'}`
                                : 'Brasil (Nacional)'}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar feriado"
                                onClick={() => handleOpenEditFeriado(h)}
                                className="text-slate-500 hover:text-primary hover:bg-primary/5"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir feriado"
                                onClick={() => handleDeleteHoliday(h.id, h.nome)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Base (Criação e Edição) */}
      <Dialog open={modalBaseOpen} onOpenChange={setModalBaseOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleSaveBase}>
            <DialogHeader>
              <DialogTitle>
                {editingBaseId ? 'Editar Faixa de Horas' : 'Nova Faixa de Horas (Tabela Base)'}
              </DialogTitle>
              <DialogDescription>
                {editingBaseId
                  ? 'Atualize a carga horária ou o valor padrão desta faixa sem recriar o registro.'
                  : 'Define a diária padrão para turnos dessa carga horária.'}
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
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Ex: 4, 6, 8, 12 horas de jornada de trabalho.
                </span>
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
                  step="0.01"
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Valor base pago ao profissional por turno nesta carga horária.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setModalBaseOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : editingBaseId ? (
                  'Salvar Alterações'
                ) : (
                  'Salvar Faixa'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Exceção Posto (Criação e Edição) */}
      <Dialog open={modalExcecaoOpen} onOpenChange={setModalExcecaoOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSaveExcecao}>
            <DialogHeader>
              <DialogTitle>
                {editingExcecaoId ? 'Editar Exceção de Preço' : 'Nova Exceção de Preço por Posto'}
              </DialogTitle>
              <DialogDescription>
                {editingExcecaoId
                  ? 'Atualize o posto, tipo, valor e período de vigência desta exceção.'
                  : 'Vincule regras pontuais de treinamento ou turnos diferenciados a um posto.'}
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
                    {postos.length === 0 ? (
                      <SelectItem value="nenhum" disabled>
                        Nenhum posto cadastrado
                      </SelectItem>
                    ) : (
                      postos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} {p.funcao ? `(${p.funcao})` : ''}
                        </SelectItem>
                      ))
                    )}
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
                    min={1}
                    step="0.01"
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
                    min={1}
                    max={90}
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Quantidade de dias iniciais contados a partir da data de início.
                  </span>
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
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setModalExcecaoOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : editingExcecaoId ? (
                  'Salvar Alterações'
                ) : (
                  'Salvar Exceção'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Importar Feriados Nacionais (BrasilAPI) */}
      <Dialog open={modalImportarOpen} onOpenChange={setModalImportarOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-primary" />
              Importar Feriados Nacionais
            </DialogTitle>
            <DialogDescription>
              Busca na BrasilAPI oficial os feriados nacionais do ano selecionado e cadastra os que
              ainda não existirem no sistema (sem duplicar).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Ano Desejado *
              </label>
              <Input
                type="number"
                min={1900}
                max={2199}
                value={anoImportacao}
                onChange={(e) => setAnoImportacao(e.target.value)}
                placeholder="2026"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Fonte: BrasilAPI (pública, sem necessidade de chave). Feriados estaduais e
                municipais permanecem com cadastro manual.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isImporting}
              onClick={() => setModalImportarOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isImporting}
              onClick={handleImportarFeriadosNacionais}
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Importando da BrasilAPI...
                </>
              ) : (
                'Importar Agora'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Feriado (Criação e Edição) */}
      <Dialog open={modalFeriadoOpen} onOpenChange={setModalFeriadoOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveFeriado}>
            <DialogHeader>
              <DialogTitle>{editingFeriadoId ? 'Editar Feriado' : 'Cadastrar Feriado'}</DialogTitle>
              <DialogDescription>
                {editingFeriadoId
                  ? 'Atualize o nome, data, tipo ou cidade/UF deste feriado.'
                  : 'Feriados são confrontados com a data do turno e endereço do posto.'}
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
                  <Select
                    value={feriadoTipo}
                    onValueChange={(v) => handleTipoFeriadoChange(v as HolidayTipo)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nacional">Nacional</SelectItem>
                      <SelectItem value="estadual">Estadual</SelectItem>
                      <SelectItem value="municipal">Municipal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sugestões rápidas a partir dos postos cadastrados */}
              {(feriadoTipo === 'municipal' || feriadoTipo === 'estadual') &&
                (postosLocalidades.length > 0 || postosUfs.length > 0) && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Localidades encontradas nos postos cadastrados:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {feriadoTipo === 'municipal'
                        ? postosLocalidades.map((loc) => (
                            <button
                              key={`${loc.cidade}-${loc.uf}`}
                              type="button"
                              onClick={() => {
                                setFeriadoCidade(loc.cidade)
                                setFeriadoUf(loc.uf)
                              }}
                              className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-300 hover:border-primary/50 hover:text-primary text-slate-700 transition-colors shadow-2xs"
                            >
                              {loc.cidade}/{loc.uf}
                            </button>
                          ))
                        : postosUfs.map((uf) => (
                            <button
                              key={uf}
                              type="button"
                              onClick={() => setFeriadoUf(uf)}
                              className="text-[11px] px-2.5 py-0.5 rounded bg-white border border-slate-300 hover:border-purple-500 hover:text-purple-700 text-slate-700 transition-colors shadow-2xs font-semibold"
                            >
                              UF: {uf}
                            </button>
                          ))}
                    </div>
                  </div>
                )}

              {feriadoTipo === 'estadual' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    UF do Estado *
                  </label>
                  <Input
                    value={feriadoUf}
                    onChange={(e) => setFeriadoUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                    required
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Aplica para todos os postos localizados nesta Unidade Federativa.
                  </span>
                </div>
              )}

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
                      onChange={(e) => setFeriadoUf(e.target.value.toUpperCase())}
                      placeholder="SP"
                      maxLength={2}
                      required
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setModalFeriadoOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Salvando...
                  </>
                ) : editingFeriadoId ? (
                  'Salvar Alterações'
                ) : (
                  'Salvar Feriado'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
