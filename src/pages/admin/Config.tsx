import React, { useState, useEffect, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useSettings } from '@/contexts/SettingsContext'
import { getLogoUrl, updateSettings } from '@/services/pricing'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import {
  Palette,
  Shield,
  Building,
  Sliders,
  Upload,
  CheckCircle2,
  XCircle,
  ImageIcon,
  Users,
  CreditCard,
  AlertTriangle,
  Clock,
  Ban,
  FileCheck,
} from 'lucide-react'

import { UserAccessManagement } from './components/UserAccessManagement'
import { PaymentConfigSection } from './components/PaymentConfigSection'

export default function ConfigPage() {
  const { settings, refreshSettings } = useSettings()
  const [activeTab, setActiveTab] = useState<'whitelabel' | 'usuarios' | 'pagamentos' | 'regras'>(
    'whitelabel',
  )
  const [isSaving, setIsSaving] = useState(false)

  // 1. White Label
  const [nomeEmpresa, setNomeEmpresa] = useState('Facilities Pro')
  const [corPrimaria, setCorPrimaria] = useState('#0F766E')
  const [corSecundaria, setCorSecundaria] = useState('#134E4A')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [isRemovingLogo, setIsRemovingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 2. Parâmetros de Escrow e Disputas
  const [guaranteeDays, setGuaranteeDays] = useState(7)
  const [disputeHours, setDisputeHours] = useState(24)

  // 3. Regras de Multa e Cancelamento (espelhando Profreela)
  const [multaFaltaPro, setMultaFaltaPro] = useState(50)
  const [multaCancelamentoPro, setMultaCancelamentoPro] = useState(30)
  const [carenciaCancelamentoEmpresa, setCarenciaCancelamentoEmpresa] = useState(12)
  const [multaEmpresaCancelamento, setMultaEmpresaCancelamento] = useState(0)
  const [horasBloqueioCancelamento, setHorasBloqueioCancelamento] = useState(24)
  const [limiteReincidenciaSuspensao, setLimiteReincidenciaSuspensao] = useState(2)

  // 4. Configuração de Pagamento da Empresa
  const [payoutProvider, setPayoutProvider] = useState<'mercadopago' | 'pix_manual' | 'outro'>(
    'mercadopago',
  )
  const [empresaPixChave, setEmpresaPixChave] = useState('financeiro@facilitiespro.com.br')
  const [empresaPixTipo, setEmpresaPixTipo] = useState('email')
  const [empresaTitular, setEmpresaTitular] = useState('Facilities Pro Pagamentos Ltda')
  const [empresaMpClientId, setEmpresaMpClientId] = useState('')

  useEffect(() => {
    if (settings) {
      setNomeEmpresa(settings.nome_empresa || 'Facilities Pro')
      setCorPrimaria(settings.cor_primaria || '#0F766E')
      setCorSecundaria(settings.cor_secundaria || '#134E4A')
      setGuaranteeDays(settings.guarantee_period_days || 7)
      setDisputeHours(settings.dispute_period_hours || 24)
      setPayoutProvider(settings.payout_provider || 'mercadopago')

      setMultaFaltaPro(settings.multa_falta_pro ?? 50)
      setMultaCancelamentoPro(settings.multa_cancelamento_pro ?? 30)
      setCarenciaCancelamentoEmpresa(settings.carencia_cancelamento_empresa ?? 12)
      setMultaEmpresaCancelamento(settings.multa_empresa_cancelamento ?? 0)
      setHorasBloqueioCancelamento(settings.horas_bloqueio_cancelamento ?? 24)
      setLimiteReincidenciaSuspensao(settings.limite_reincidencia_suspensao ?? 2)

      setEmpresaPixChave(settings.empresa_pix_chave || 'financeiro@facilitiespro.com.br')
      setEmpresaPixTipo(settings.empresa_pix_tipo || 'email')
      setEmpresaTitular(settings.empresa_titular || 'Facilities Pro Pagamentos Ltda')
      setEmpresaMpClientId(settings.empresa_mp_client_id || '')

      if (settings.logo && !isRemovingLogo) {
        setLogoPreviewUrl(getLogoUrl(settings))
      }
    }
  }, [settings, isRemovingLogo])

  // Manipulador de upload de logo do computador
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo (PNG, JPG, SVG) e tamanho (até 2MB)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, selecione uma imagem PNG, JPG ou SVG.',
        variant: 'destructive',
      })
      return
    }

    const maxBytes = 2 * 1024 * 1024 // 2MB
    if (file.size > maxBytes) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O logotipo deve ter no máximo 2MB.',
        variant: 'destructive',
      })
      return
    }

    setLogoFile(file)
    setIsRemovingLogo(false)
    const preview = URL.createObjectURL(file)
    setLogoPreviewUrl(preview)

    toast({
      title: 'Logo selecionado',
      description: `${file.name} pronto para upload. Clique em "Salvar Configurações".`,
    })
  }

  const handleRemoveLogo = () => {
    setLogoFile(null)
    setLogoPreviewUrl(null)
    setIsRemovingLogo(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      // Usar FormData para permitir upload de arquivo em PocketBase
      const formData = new FormData()
      formData.append('nome_empresa', nomeEmpresa.trim())
      formData.append('cor_primaria', corPrimaria.trim())
      formData.append('cor_secundaria', corSecundaria.trim())
      formData.append('guarantee_period_days', String(Number(guaranteeDays)))
      formData.append('dispute_period_hours', String(Number(disputeHours)))
      formData.append('payout_provider', payoutProvider)

      formData.append('multa_falta_pro', String(Number(multaFaltaPro)))
      formData.append('multa_cancelamento_pro', String(Number(multaCancelamentoPro)))
      formData.append('carencia_cancelamento_empresa', String(Number(carenciaCancelamentoEmpresa)))
      formData.append('multa_empresa_cancelamento', String(Number(multaEmpresaCancelamento)))
      formData.append('horas_bloqueio_cancelamento', String(Number(horasBloqueioCancelamento)))
      formData.append('limite_reincidencia_suspensao', String(Number(limiteReincidenciaSuspensao)))

      formData.append('empresa_pix_chave', empresaPixChave.trim())
      formData.append('empresa_pix_tipo', empresaPixTipo.trim())
      formData.append('empresa_titular', empresaTitular.trim())
      formData.append('empresa_mp_client_id', empresaMpClientId.trim())

      if (logoFile) {
        formData.append('logo', logoFile)
      } else if (isRemovingLogo) {
        formData.append('logo', '')
      }

      if (settings?.id) {
        await pb.collection('settings').update(settings.id, formData)
      } else {
        await pb.collection('settings').create(formData)
      }

      await refreshSettings()
      setIsRemovingLogo(false)
      setLogoFile(null)

      toast({
        title: 'Configurações salvas com sucesso!',
        description:
          'Os parâmetros, regras e identidade visual foram atualizados em todo o sistema.',
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
    <div className="max-w-5xl space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-teal-700" />
            Configurações do Sistema & White-Label
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Personalize a marca do cliente (logo e cores), níveis de acesso dos perfis, conta
            bancária para liquidação e regras de cancelamento.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="bg-slate-200/80 p-1 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger
            value="whitelabel"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <Palette className="w-4 h-4" />
            White-Label & Logo
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="text-xs font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            Níveis de Acesso
          </TabsTrigger>
          <TabsTrigger
            value="pagamentos"
            className="text-xs font-semibold flex items-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" />
            Conta & Pagamentos
          </TabsTrigger>
          <TabsTrigger value="regras" className="text-xs font-semibold flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            Regras de Cancelamento
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSave}>
          {/* ABA 1: WHITE-LABEL E UPLOAD DE LOGO */}
          <TabsContent value="whitelabel" className="space-y-6 m-0">
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-teal-700" />
                  Identidade White-Label (Marca & Logotipo)
                </CardTitle>
                <CardDescription>
                  Configurações visuais aplicadas instantaneamente ao cabeçalho (header), sidebar e
                  telas do aplicativo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload de Logo */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                    Logotipo da Empresa
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {/* Preview do Logo */}
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative">
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Preview do Logo"
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                          <span className="text-[10px]">Sem logo</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1 text-center sm:text-left">
                      <div className="text-xs text-slate-600">
                        Envie uma imagem em formato <strong>PNG, JPG ou SVG</strong> (até 2MB). O
                        logotipo será exibido no topo da tela e na barra lateral.
                      </div>
                      <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          onChange={handleLogoChange}
                          className="hidden"
                          id="logo-upload-input"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-white hover:bg-slate-100 text-xs text-slate-700 border-slate-300"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5 text-teal-700" />
                          Enviar logo do computador
                        </Button>
                        {logoPreviewUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs"
                            onClick={handleRemoveLogo}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Remover logo
                          </Button>
                        )}
                      </div>
                      {logoFile && (
                        <p className="text-[11px] text-teal-700 font-medium">
                          Arquivo selecionado: {logoFile.name} ({(logoFile.size / 1024).toFixed(1)}{' '}
                          KB)
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Campos existentes: Nome da Empresa e Cores */}
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

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white font-medium px-8"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações de White-Label'}
              </Button>
            </div>
          </TabsContent>

          {/* ABA 2: NÍVEIS DE ACESSO */}
          <TabsContent value="usuarios" className="space-y-6 m-0">
            <UserAccessManagement />
          </TabsContent>

          {/* ABA 3: CONFIGURAÇÃO DE PAGAMENTO AUTOMÁTICO */}
          <TabsContent value="pagamentos" className="space-y-6 m-0">
            <PaymentConfigSection
              settings={settings}
              payoutProvider={payoutProvider}
              setPayoutProvider={setPayoutProvider}
              empresaPixChave={empresaPixChave}
              setEmpresaPixChave={setEmpresaPixChave}
              empresaPixTipo={empresaPixTipo}
              setEmpresaPixTipo={setEmpresaPixTipo}
              empresaTitular={empresaTitular}
              setEmpresaTitular={setEmpresaTitular}
              empresaMpClientId={empresaMpClientId}
              setEmpresaMpClientId={setEmpresaMpClientId}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white font-medium px-8"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Configurações de Pagamento'}
              </Button>
            </div>
          </TabsContent>

          {/* ABA 4: REGRAS DE MULTA E CANCELAMENTO (ESPELHO PROFREELA) */}
          <TabsContent value="regras" className="space-y-6 m-0">
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-700" />
                  Regras de Multa e Cancelamento (Modelo Operacional Profreela)
                </CardTitle>
                <CardDescription>
                  Centralize os prazos, carências e penalidades aplicados aos profissionais e
                  empresas contratantes. Todos os valores são dinâmicos e alimentam os hooks e o
                  cron de escrow em tempo real.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 1. Multa por No-show */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    1. Falta do Profissional (No-Show)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Quando o pro não comparece ao turno confirmado, o sistema cancela o payout
                    associado, aplica a penalidade configurada no livro de eventos contábeis
                    (payment_events) e dispara a <strong>reoferta automática</strong> da vaga para
                    outros profissionais ativos.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Multa por No-Show (R$) *
                      </label>
                      <Input
                        type="number"
                        value={multaFaltaPro}
                        onChange={(e) => setMultaFaltaPro(Number(e.target.value))}
                        min={0}
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Valor debitado/registrado em conta corrente interna do pro (default R$ 50).
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Cancelamento do Pro após aceitar */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Ban className="w-4 h-4 text-amber-600" />
                    2. Cancelamento do Profissional (Após Aceite da Convocação)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Quando o profissional desiste de uma convocação previamente aceita, a escala é
                    reaberta automaticamente para nova cobertura, e o profissional sofre bloqueio
                    temporário de chamadas. Se houver reincidência cumulativa, o cadastro é suspenso
                    pelo sistema.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Horas de Bloqueio Temporário *
                      </label>
                      <Input
                        type="number"
                        value={horasBloqueioCancelamento}
                        onChange={(e) => setHorasBloqueioCancelamento(Number(e.target.value))}
                        min={1}
                        max={168}
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Período sem receber convocações (default 24h).
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Limite de Reincidência (Suspensão) *
                      </label>
                      <Input
                        type="number"
                        value={limiteReincidenciaSuspensao}
                        onChange={(e) => setLimiteReincidenciaSuspensao(Number(e.target.value))}
                        min={1}
                        max={10}
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Número de cancelamentos acumulados que mudam status para
                        &apos;suspenso&apos; (default 2).
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Multa Contratual do Pro (R$)
                      </label>
                      <Input
                        type="number"
                        value={multaCancelamentoPro}
                        onChange={(e) => setMultaCancelamentoPro(Number(e.target.value))}
                        min={0}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Penalidade financeira opcional debitada no cancelamento pós-aceite.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Cancelamento pela Empresa e Carência */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Clock className="w-4 h-4 text-blue-600" />
                    3. Cancelamento pelo Cliente Contratante (Empresa)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A empresa contratante tem uma janela de carência para cancelamento sem ônus.
                    Cancelamentos feitos fora da janela de carência incorrem em taxa de cobertura
                    parcial devida ao profissional.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Carência Mínima de Cancelamento (Horas de Antecedência) *
                      </label>
                      <Input
                        type="number"
                        value={carenciaCancelamentoEmpresa}
                        onChange={(e) => setCarenciaCancelamentoEmpresa(Number(e.target.value))}
                        min={1}
                        max={72}
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Cancelamento com menos de X horas do início do turno ativa multa
                        compensatória (default 12h).
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Multa / Indenização ao Pro por Cancelamento Tardio (R$)
                      </label>
                      <Input
                        type="number"
                        value={multaEmpresaCancelamento}
                        onChange={(e) => setMultaEmpresaCancelamento(Number(e.target.value))}
                        min={0}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Compensação creditada ao profissional por quebra de carência.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. Escrow & Janela de Disputa */}
                <div className="p-4 bg-teal-50/60 rounded-xl border border-teal-200 space-y-3">
                  <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
                    <FileCheck className="w-4 h-4 text-teal-700" />
                    4. Escrow Contábil & Janela de Disputas
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Período de Garantia do Escrow (Dias) *
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
                        Prazo até o cron liberar o repasse automático (default 7 dias).
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Janela para Abertura de Disputa (Horas) *
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
                        Prazo após o turno para a empresa ou pro contestar o pagamento (default
                        24h).
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white font-medium px-8"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Regras de Cancelamento & Escrow'}
              </Button>
            </div>
          </TabsContent>
        </form>
      </Tabs>
    </div>
  )
}
