import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ConvocacaoRecord } from '@/types/facilities'
import { formatCurrencyBRL, formatDateBR } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { Calendar, Clock, MapPin, AlertCircle, Ban } from 'lucide-react'

export default function MinhasEscalasPage() {
  const { user } = useAuth()
  const [escalas, setEscalas] = useState<ConvocacaoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const records = await pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
        filter: `pro = "${user.id}" && (status = "aceita" || status = "falta" || status = "coberta" || status = "cancelada")`,
        sort: '-data_convocacao',
        expand: 'escala,escala.posto',
      })
      setEscalas(records)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar escalas',
        description: 'Tente recarregar a página.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleCancelarTurno = async (conv: ConvocacaoRecord) => {
    const confirm = window.confirm(
      'Atenção: o cancelamento de um turno previamente aceito reabrirá a vaga e aplicará um bloqueio preventivo de 24 horas no seu perfil. Deseja realmente prosseguir?',
    )
    if (!confirm) return

    setCancelingId(conv.id)
    try {
      await pb.collection('convocacoes').update(conv.id, {
        status: 'cancelada',
      })

      toast({
        title: 'Turno cancelado',
        description: 'A escala foi reaberta e a política operacional de 24h foi acionada.',
        variant: 'destructive',
      })
      loadData()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao cancelar turno',
        description: 'Não foi possível cancelar.',
        variant: 'destructive',
      })
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Meus Postos / Minhas Escalas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe suas alocações confirmadas, turnos realizados e o andamento das diárias.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : escalas.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-2">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">Nenhuma escala programada</h3>
            <p className="text-sm text-slate-400">
              Quando você aceita convocações na sua caixa de entrada, seus turnos aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {escalas.map((conv) => {
            const escala = conv.expand?.escala
            const posto = escala?.expand?.posto
            const end = posto?.endereco as any

            let badgeVariant = 'bg-emerald-100 text-emerald-800 border-emerald-200'
            let statusLabel = 'Confirmado / Agendado'

            if (conv.status === 'cancelada') {
              badgeVariant = 'bg-rose-100 text-rose-800 border-rose-200'
              statusLabel = 'Cancelado'
            } else if (conv.status === 'falta') {
              badgeVariant = 'bg-red-100 text-red-900 border-red-300'
              statusLabel = 'Falta (No-show)'
            } else if (conv.status === 'coberta') {
              badgeVariant = 'bg-blue-100 text-blue-800 border-blue-200'
              statusLabel = 'Coberto por Substituto'
            }

            return (
              <Card
                key={conv.id}
                className="border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                      {posto?.funcao || 'Operacional'}
                    </span>
                    <Badge variant="outline" className={`${badgeVariant} text-xs font-medium`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900 mt-2">
                    {posto?.nome || 'Posto'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-slate-400 font-medium uppercase text-[10px]">
                        Data do Turno
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {formatDateBR(escala?.data)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-medium uppercase text-[10px]">
                        Horário
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {escala?.turno_inicio} às {escala?.turno_fim}
                      </div>
                    </div>
                  </div>

                  {end && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {end.logradouro}, {end.numero} - {end.bairro}, {end.cidade}/{end.uf}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div>
                      <div className="text-xs text-slate-400">Valor da diária</div>
                      <div className="text-base font-bold text-teal-700">
                        {formatCurrencyBRL(conv.valor_diaria)}
                      </div>
                    </div>

                    {conv.status === 'aceita' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled={cancelingId === conv.id}
                        onClick={() => handleCancelarTurno(conv)}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" />
                        Cancelar presença
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
