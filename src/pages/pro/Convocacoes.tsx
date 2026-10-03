import React, { useState, useEffect, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ConvocacaoRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'
import { calcularDiariaEngine } from '@/services/pricing'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  DollarSign,
  Calendar,
  MessageSquare,
} from 'lucide-react'

export default function ConvocacoesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'pendentes' | 'minhas'>('pendentes')
  const [convocacoes, setConvocacoes] = useState<ConvocacaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadConvocacoes = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const records = await pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
        filter: `pro = "${user.id}"`,
        sort: '-created',
        expand: 'escala,escala.posto',
      })

      // Recalcular e atualizar em tempo real o valor exato da diária e a regra aplicada
      const updated = await Promise.all(
        records.map(async (c) => {
          if (c.status === 'pendente' && c.escala) {
            try {
              const calc = await calcularDiariaEngine(c.escala, user.id)
              return {
                ...c,
                valor_diaria: calc.valor,
                regra_aplicada: calc.regra_aplicada,
              }
            } catch {
              return c
            }
          }
          return c
        }),
      )

      setConvocacoes(updated)
    } catch (err) {
      console.error('Erro ao buscar convocações:', err)
      toast({
        title: 'Erro ao carregar convocações',
        description: 'Não foi possível carregar a lista do servidor.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadConvocacoes()

    // Inscrição Realtime no PocketBase para o inbox atualizar na hora sem refresh
    let unsub: (() => void) | undefined
    if (user?.id) {
      pb.collection('convocacoes')
        .subscribe('*', (e) => {
          if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
            loadConvocacoes()
          }
        })
        .then((u) => {
          unsub = u
        })
        .catch(() => {})
    }

    return () => {
      if (unsub) unsub()
    }
  }, [loadConvocacoes, user])

  const handleAceitar = async (conv: ConvocacaoRecord) => {
    setActionLoading(conv.id)
    try {
      await pb.collection('convocacoes').update(conv.id, {
        status: 'aceita',
        valor_diaria: conv.valor_diaria,
        regra_aplicada: conv.regra_aplicada,
      })

      toast({
        title: 'Convocação aceita com sucesso!',
        description: `Escrow de ${formatCurrencyBRL(conv.valor_diaria)} provisionado. Seu turno está confirmado.`,
      })
      loadConvocacoes()
    } catch (err) {
      console.error('Erro ao aceitar:', err)
      toast({
        title: 'Erro ao aceitar turno',
        description: 'Tente novamente ou contate a central.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRecusar = async (conv: ConvocacaoRecord) => {
    setActionLoading(conv.id)
    try {
      await pb.collection('convocacoes').update(conv.id, {
        status: 'recusada',
      })

      toast({
        title: 'Convocação recusada',
        description: 'O turno será reofertado para outros profissionais.',
      })
      loadConvocacoes()
    } catch (err) {
      console.error('Erro ao recusar:', err)
      toast({
        title: 'Erro ao recusar turno',
        description: 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const filteredConvocacoes = convocacoes.filter((c) => {
    if (activeTab === 'pendentes') return c.status === 'pendente'
    return c.status === 'aceita'
  })

  return (
    <div className="space-y-6">
      {/* Header com aviso de teste/status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Minhas Convocações
            <Badge
              variant="outline"
              className="bg-teal-50 text-teal-800 border-teal-200 text-xs uppercase tracking-wide"
            >
              Marketplace Fechado
            </Badge>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Você foi selecionado nominalmente pela empresa de facilities. Responda com agilidade
            para garantir sua vaga.
          </p>
        </div>

        {user?.status === 'teste' && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-lg text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-semibold">Período de Teste:</span> Diárias em ajuda de custo
              fixa ({formatCurrencyBRL(user.ajuda_custo || 50)}).
            </div>
          </div>
        )}

        {user?.status === 'ativo' && user?.valor_negociado && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-lg text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-semibold">Valor Negociado Ativo:</span>{' '}
              {formatCurrencyBRL(user.valor_negociado)} / diária.
            </div>
          </div>
        )}
      </div>

      {/* Tabs de navegação */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="bg-slate-100 p-1 rounded-lg">
              <TabsTrigger
                value="pendentes"
                className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm"
              >
                Disponíveis (Pendentes)
                {convocacoes.filter((c) => c.status === 'pendente').length > 0 && (
                  <span className="ml-2 bg-teal-600 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                    {convocacoes.filter((c) => c.status === 'pendente').length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="minhas"
                className="text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm"
              >
                Minhas Escalas Confirmadas
                {convocacoes.filter((c) => c.status === 'aceita').length > 0 && (
                  <span className="ml-2 bg-slate-200 text-slate-800 rounded-full px-2 py-0.5 text-xs">
                    {convocacoes.filter((c) => c.status === 'aceita').length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadConvocacoes}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Atualizar lista
            </Button>
          </div>
        </Tabs>
      </div>

      {/* Listagem de cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Carregando convocações...</p>
        </div>
      ) : filteredConvocacoes.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="space-y-3">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-700">
              {activeTab === 'pendentes'
                ? 'Nenhuma convocação pendente'
                : 'Você ainda não tem escalas aceitas'}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {activeTab === 'pendentes'
                ? 'Novas convocações nominais da empresa aparecerão aqui em tempo real assim que geradas.'
                : 'Quando você aceita uma convocação disponível, ela é movida para cá com provisionamento de diária.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredConvocacoes.map((conv) => {
            const escala = conv.expand?.escala
            const posto = escala?.expand?.posto
            const end = posto?.endereco as any

            return (
              <Card
                key={conv.id}
                className="overflow-hidden border border-slate-200 hover:shadow-md transition-all duration-200 bg-white group"
              >
                <div className="p-5 space-y-4">
                  {/* Top: Posto e Função */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-xs font-semibold uppercase tracking-wide">
                          {posto?.funcao || 'Operacional'}
                        </Badge>
                        {posto?.pro_fixo && posto.pro_fixo === user?.id && (
                          <Badge className="bg-teal-700 text-white text-[10px] uppercase font-bold">
                            Seu Posto Fixo
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                        {posto?.nome || 'Posto de Trabalho'}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      {posto?.pro_fixo === user?.id && posto.tipo_remuneracao_fixa === 'mensal' ? (
                        <div>
                          <div className="text-lg font-black text-teal-800">Fixo Mensal</div>
                          <div className="text-[11px] font-semibold text-slate-600">
                            {formatCurrencyBRL(posto.valor_remuneracao_fixa || 0)}/mês
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-2xl font-black text-teal-700 tabular-nums">
                            {formatCurrencyBRL(conv.valor_diaria)}
                          </div>
                          <div
                            className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded inline-block mt-0.5 max-w-[190px] truncate"
                            title={conv.regra_aplicada || 'tabela base'}
                          >
                            {conv.regra_aplicada || 'tabela base'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Informações de turno e data */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Data
                        </div>
                        <div className="font-semibold text-slate-800">
                          {formatDateBR(escala?.data)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Horário / Turno
                        </div>
                        <div className="font-semibold text-slate-800">
                          {escala?.turno_inicio} às {escala?.turno_fim} ({posto?.carga_horaria || 8}
                          h)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Endereço */}
                  {end && (
                    <div className="flex items-start gap-2 text-xs text-slate-500">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {end.logradouro}, {end.numero} - {end.bairro}, {end.cidade}/{end.uf}
                      </span>
                    </div>
                  )}

                  {/* Requisitos se houver */}
                  {posto?.requisitos && (
                    <p className="text-xs text-slate-500 line-clamp-2 bg-slate-50/50 p-2 rounded border border-slate-100">
                      <strong className="text-slate-700">Requisitos:</strong> {posto.requisitos}
                    </p>
                  )}

                  {/* Ações */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                    {conv.status === 'pendente' ? (
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-red-700"
                          disabled={actionLoading === conv.id}
                          onClick={() => handleRecusar(conv)}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Recusar
                        </Button>

                        <Button
                          size="sm"
                          className="flex-1 bg-teal-700 hover:bg-teal-800 text-white font-medium shadow-sm"
                          disabled={actionLoading === conv.id}
                          onClick={() => handleAceitar(conv)}
                        >
                          {actionLoading === conv.id ? (
                            <span className="animate-spin mr-1">⏳</span>
                          ) : (
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          )}
                          Aceitar Turno
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full flex items-center justify-between bg-emerald-50 text-emerald-800 p-2 rounded-lg text-xs">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Turno confirmado no seu calendário
                        </span>
                        <span className="text-[11px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded font-bold">
                          Escrow Provisionado
                        </span>
                      </div>
                    )}

                    {/* Botão Contextual de Mensagens para o Turno */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigate(
                          `/mensagens?convocacao=${conv.id}&escala=${conv.escala || ''}&pro=${user?.id || ''}`,
                        )
                      }}
                      className="w-full text-xs text-teal-700 hover:bg-teal-50 hover:text-teal-800 flex items-center justify-center gap-1.5 h-8 border border-teal-100"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Mensagens sobre este turno (horário / suporte)
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
