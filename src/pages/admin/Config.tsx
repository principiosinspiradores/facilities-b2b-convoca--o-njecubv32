import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useSettings } from '@/contexts/SettingsContext'
import { SettingsRecord } from '@/types/facilities'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Palette, Shield, Building, Sliders, CheckCircle2 } from 'lucide-react'

export default function ConfigPage() {
  const { settings, refreshSettings } = useSettings()
  const [isSaving, setIsSaving] = useState(false)

  const [nomeEmpresa, setNomeEmpresa] = useState('Facilities Pro')
  const [corPrimaria, setCorPrimaria] = useState('#0F766E')
  const [corSecundaria, setCorSecundaria] = useState('#134E4A')
  const [guaranteeDays, setGuaranteeDays] = useState(7)
  const [disputeHours, setDisputeHours] = useState(24)
  const [payoutProvider, setPayoutProvider] = useState<'mercadopago' | 'pix_manual' | 'outro'>(
    'mercadopago',
  )
  const [multaFaltaPro, setMultaFaltaPro] = useState(50)
  const [multaEmpresaCancelamento, setMultaEmpresaCancelamento] = useState(0)

  useEffect(() => {
    if (settings) {
      setNomeEmpresa(settings.nome_empresa || 'Facilities Pro')
      setCorPrimaria(settings.cor_primaria || '#0F766E')
      setCorSecundaria(settings.cor_secundaria || '#134E4A')
      setGuaranteeDays(settings.guarantee_period_days || 7)
      setDisputeHours(settings.dispute_period_hours || 24)
      setPayoutProvider(settings.payout_provider || 'mercadopago')
      setMultaFaltaPro(settings.multa_falta_pro || 50)
      setMultaEmpresaCancelamento(settings.multa_empresa_cancelamento || 0)
    }
  }, [settings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const payload = {
        nome_empresa: nomeEmpresa.trim(),
        cor_primaria: corPrimaria.trim(),
        cor_secundaria: corSecundaria.trim(),
        guarantee_period_days: Number(guaranteeDays),
        dispute_period_hours: Number(disputeHours),
        payout_provider: payoutProvider,
        multa_falta_pro: Number(multaFaltaPro),
        multa_empresa_cancelamento: Number(multaEmpresaCancelamento),
      }

      if (settings?.id) {
        await pb.collection('settings').update(settings.id, payload)
      } else {
        await pb.collection('settings').create(payload)
      }

      await refreshSettings()
      toast({
        title: 'Configurações White-Label salvas!',
        description:
          'A identidade visual e parâmetros do sistema foram atualizados em todo o aplicativo.',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar configurações',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-teal-700" />
            Configurações & White-Label da Plataforma
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Personalize o nome da marca, cores institucionais do cliente e parâmetros operacionais
            de escrow e multas.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* White-label Card */}
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-5 h-5 text-teal-700" />
              Identidade White-Label (Pronto para Revenda)
            </CardTitle>
            <CardDescription>
              Configuração dinâmica aplicada instantaneamente ao cabeçalho, barra lateral, telas de
              login e e-mails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nome da Empresa / Marca *
              </label>
              <Input
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                placeholder="Facilities Pro"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Cor Primária (Hex)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                    className="w-10 h-10 p-1 border rounded cursor-pointer shrink-0"
                  />
                  <Input
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                    placeholder="#0F766E"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Cor Secundária / Sidebar (Hex)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corSecundaria}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                    className="w-10 h-10 p-1 border rounded cursor-pointer shrink-0"
                  />
                  <Input
                    value={corSecundaria}
                    onChange={(e) => setCorSecundaria(e.target.value)}
                    placeholder="#134E4A"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Políticas de Escrow e Multas */}
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-700" />
              Parâmetros de Escrow & Resoluções Operacionais
            </CardTitle>
            <CardDescription>
              Regras temporais de retenção, janelas de contestação e penalidades contratuais
              automatizadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Período de Garantia do Escrow (Dias)
                </label>
                <Input
                  type="number"
                  value={guaranteeDays}
                  onChange={(e) => setGuaranteeDays(Number(e.target.value))}
                  min={1}
                  max={60}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Tempo até liberação automática do repasse (default 7 dias).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Janela para Abertura de Disputa (Horas)
                </label>
                <Input
                  type="number"
                  value={disputeHours}
                  onChange={(e) => setDisputeHours(Number(e.target.value))}
                  min={1}
                  max={72}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Prazo pós-conclusão para contestação (default 24h).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Provedor Padrão de Payout
                </label>
                <Select value={payoutProvider} onValueChange={(v) => setPayoutProvider(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mercadopago">Mercado Pago Pix</SelectItem>
                    <SelectItem value="pix_manual">Pix Direto</SelectItem>
                    <SelectItem value="outro">Outro Provedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Multa por Falta do Pro (R$)
                </label>
                <Input
                  type="number"
                  value={multaFaltaPro}
                  onChange={(e) => setMultaFaltaPro(Number(e.target.value))}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Aplicada em no-show (default R$50).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Multa Empresa Cancelamento (R$)
                </label>
                <Input
                  type="number"
                  value={multaEmpresaCancelamento}
                  onChange={(e) => setMultaEmpresaCancelamento(Number(e.target.value))}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Carência contratual da empresa.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="bg-teal-700 hover:bg-teal-800 text-white font-medium px-8"
            disabled={isSaving}
          >
            {isSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}
          </Button>
        </div>
      </form>
    </div>
  )
}
