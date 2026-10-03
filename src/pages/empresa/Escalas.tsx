import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { EscalaRecord, PostoRecord, UserRecord, ConvocacaoRecord } from '@/types/facilities'
import { formatDateBR, formatCurrencyBRL } from '@/lib/formatters'
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
import { Calendar, Plus, Users, Send, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

export default function EscalasPage() {
  const [escalas, setEscalas] = useState<EscalaRecord[]>([])
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal Nova Escala
  const [modalNovaEscala, setModalNovaEscala] = useState(false)
  const [selectedPostoId, setSelectedPostoId] = useState('')
  const [dataEscala, setDataEscala] = useState('')
  const [turnoInicio, setTurnoInicio] = useState('07:00')
  const [turnoFim, setTurnoFim] = useState('15:00')
  const [valorDiaria, setValorDiaria] = useState(180)
  const [isCreatingEscala, setIsCreatingEscala] = useState(false)

  // Modal Convocar Pros
  const [modalConvocar, setModalConvocar] = useState(false)
  const [selectedEscala, setSelectedEscala] = useState<EscalaRecord | null>(null)
  const [selectedProIds, setSelectedProIds] = useState<string[]>([])
  const [isSendingConvocacoes, setIsSendingConvocacoes] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [escalasRes, postosRes, prosRes, convocacoesRes] = await Promise.all([
        pb.collection('escalas').getFullList<EscalaRecord>({
          sort: '-data',
          expand: 'posto',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          filter: 'status = "ativo"',
          sort: 'nome',
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

  const handleCreateEscala = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostoId || !dataEscala) {
      toast({
        title: 'Preencha os campos obrigatórios',
        variant: 'destructive',
      })
      return
    }

    setIsCreatingEscala(true)
    try {
      await pb.collection('escalas').create({
        posto: selectedPostoId,
        data: new Date(dataEscala).toISOString(),
        turno_inicio: turnoInicio,
        turno_fim: turnoFim,
        status: 'aberta',
        multa_aplicada: false,
        valor_diaria: Number(valorDiaria),
      })

      toast({
        title: 'Escala aberta com sucesso!',
        description: 'Agora selecione os profissionais elegíveis para convocação nominal.',
      })
      setModalNovaEscala(false)
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao criar escala',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingEscala(false)
    }
  }

  const openConvocarModal = (escala: EscalaRecord) => {
    setSelectedEscala(escala)
    setSelectedProIds([])
    setModalConvocar(true)
  }

  const handleToggleProSelection = (proId: string) => {
    if (selectedProIds.includes(proId)) {
      setSelectedProIds(selectedProIds.filter((id) => id !== proId))
    } else {
      setSelectedProIds([...selectedProIds, proId])
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
      for (const proId of selectedProIds) {
        // Checar se já tem convocação
        const existing = convocacoes.find((c) => c.escala === selectedEscala.id && c.pro === proId)
        if (!existing) {
          const proObj = pros.find((p) => p.id === proId)
          let rule = 'tabela base'
          let val = selectedEscala.valor_diaria || 180
          if (proObj?.status === 'teste') {
            val = proObj.ajuda_custo || 50
            rule = 'ajuda de custo (teste)'
          } else if (proObj?.valor_negociado) {
            val = proObj.valor_negociado
            rule = 'valor negociado'
          }

          await pb.collection('convocacoes').create({
            escala: selectedEscala.id,
            pro: proId,
            status: 'pendente',
            valor_diaria: val,
            regra_aplicada: rule,
            data_convocacao: now,
          })
        }
      }

      // Atualiza escala para convocada
      await pb.collection('escalas').update(selectedEscala.id, {
        status: 'convocada',
      })

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
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-700" />
            Escalas & Convocação Nominal
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gere os turnos por posto e dispare as convocações exclusivas para profissionais
            elegíveis.
          </p>
        </div>
        <Button
          onClick={() => setModalNovaEscala(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Gerar Nova Escala
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : escalas.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-3">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">Nenhuma escala programada</h3>
            <p className="text-sm text-slate-400">
              Clique em "Gerar Nova Escala" para abrir um turno em um posto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {escalas.map((escala) => {
            const posto = escala.expand?.posto
            const convsDestaEscala = convocacoes.filter((c) => c.escala === escala.id)
            const aceito = convsDestaEscala.find((c) => c.status === 'aceita')

            let badgeVariant = 'bg-slate-100 text-slate-800'
            if (escala.status === 'aceita') badgeVariant = 'bg-emerald-100 text-emerald-800'
            if (escala.status === 'falta') badgeVariant = 'bg-red-100 text-red-800'
            if (escala.status === 'convocada') badgeVariant = 'bg-amber-100 text-amber-800'

            return (
              <Card key={escala.id} className="border border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-teal-50 text-teal-800 border-teal-200 text-xs font-semibold"
                        >
                          {posto?.funcao || 'Posto'}
                        </Badge>
                        <Badge className={`${badgeVariant} text-xs uppercase tracking-wide`}>
                          Status: {escala.status}
                        </Badge>
                        {escala.multa_aplicada && (
                          <Badge className="bg-red-600 text-white text-xs">Multa Aplicada</Badge>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        {posto?.nome || 'Posto não especificado'}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-teal-600" />
                          {formatDateBR(escala.data)}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-teal-600" />
                          {escala.turno_inicio} às {escala.turno_fim}
                        </span>
                        <span>
                          Diária: <strong>{formatCurrencyBRL(escala.valor_diaria)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {aceito ? (
                        <div className="text-right bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg text-xs text-emerald-900">
                          <div className="font-bold flex items-center gap-1 justify-end">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Turno Coberto por:
                          </div>
                          <div className="font-semibold text-slate-900">
                            {aceito.expand?.pro?.name || 'Profissional'}
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => openConvocarModal(escala)}
                          className="bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs h-9"
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Convocar Profissionais ({convsDestaEscala.length})
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Lista de convocados */}
                  {convsDestaEscala.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Histórico de Convocações Deste Turno
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {convsDestaEscala.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded text-xs text-slate-700"
                          >
                            <span className="font-semibold">{c.expand?.pro?.name || 'Pro'}</span>
                            <span className="text-slate-400">
                              ({formatCurrencyBRL(c.valor_diaria)})
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                c.status === 'aceita'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : c.status === 'recusada'
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                              }
                            >
                              {c.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nova Escala */}
      <Dialog open={modalNovaEscala} onOpenChange={setModalNovaEscala}>
        <DialogContent>
          <form onSubmit={handleCreateEscala}>
            <DialogHeader>
              <DialogTitle>Gerar Nova Escala de Trabalho</DialogTitle>
              <DialogDescription>
                Selecione o posto contratante, o dia do turno e o horário de cobertura.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Valor da Diária Base (R$)
                </label>
                <Input
                  type="number"
                  value={valorDiaria}
                  onChange={(e) => setValorDiaria(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalNovaEscala(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white"
                disabled={isCreatingEscala}
              >
                {isCreatingEscala ? 'Gerando...' : 'Salvar Escala'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Convocar Pros Elegíveis */}
      <Dialog open={modalConvocar} onOpenChange={setModalConvocar}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convocar Profissionais Elegíveis</DialogTitle>
            <DialogDescription>
              Apenas profissionais cadastrados com documentos validados, status ativo ou teste podem
              ser convocados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-800">
                  {selectedEscala?.expand?.posto?.nome}
                </div>
                <div className="text-slate-500">
                  Data: {formatDateBR(selectedEscala?.data)} ({selectedEscala?.turno_inicio} às{' '}
                  {selectedEscala?.turno_fim})
                </div>
              </div>
              <div className="text-right">
                <span className="text-teal-700 font-bold">
                  {formatCurrencyBRL(selectedEscala?.valor_diaria)}
                </span>
              </div>
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
                            ? 'bg-teal-50 border-teal-500 text-teal-900'
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
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <div>
                            <div className="font-semibold">{pro.name || pro.email}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>Status: {pro.status}</span>
                              {pro.status === 'teste' && <span>(Ajuda de Custo: R$ 50)</span>}
                              {pro.valor_negociado && (
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
              className="bg-teal-700 hover:bg-teal-800 text-white"
              disabled={isSendingConvocacoes || selectedProIds.length === 0}
            >
              {isSendingConvocacoes
                ? 'Enviando...'
                : `Disparar ${selectedProIds.length} Convocações`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
