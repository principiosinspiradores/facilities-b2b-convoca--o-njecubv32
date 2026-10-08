import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import {
  Bell,
  BellRing,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  Send,
  Loader2,
  Info,
} from 'lucide-react'
import {
  isPushNotificationSupported,
  checkIosRequiresInstallation,
  getActivePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
} from '@/services/pushNotifications'
import pb from '@/lib/pocketbase/client'

export function PushNotificationConfigSection() {
  const [isSupported, setIsSupported] = useState(true)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [iosWarning, setIosWarning] = useState<string | null>(null)
  const [activeSubscriptionsCount, setActiveSubscriptionsCount] = useState<number>(0)

  // Carregar status inicial
  const checkStatus = async () => {
    setIsLoading(true)
    const supported = isPushNotificationSupported()
    setIsSupported(supported)

    if (!supported) {
      setIsLoading(false)
      return
    }

    const iosCheck = checkIosRequiresInstallation()
    if (iosCheck.requiresInstall) {
      setIosWarning(iosCheck.message || null)
    } else {
      setIosWarning(null)
    }

    try {
      const sub = await getActivePushSubscription()
      const permissionGranted =
        typeof Notification !== 'undefined' && Notification.permission === 'granted'
      setIsEnabled(Boolean(sub && permissionGranted))

      // Contar inscrições do usuário no PocketBase
      if (pb.authStore.model?.id) {
        const list = await pb.collection('push_subscriptions').getList(1, 10, {
          filter: `user = "${pb.authStore.model.id}"`,
        })
        setActiveSubscriptionsCount(list.totalItems)
      }
    } catch (err) {
      console.warn('Erro ao verificar status push:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const handleToggle = async (checked: boolean) => {
    if (iosWarning) {
      toast({
        title: 'Instale o aplicativo primeiro',
        description: iosWarning,
        variant: 'destructive',
      })
      return
    }

    setIsToggling(true)
    try {
      if (checked) {
        const res = await subscribeToPush()
        if (res.success) {
          setIsEnabled(true)
          toast({
            title: 'Notificações ativadas!',
            description:
              'Você receberá convocações, alterações de turnos e alertas mesmo com o app fechado.',
          })
          await checkStatus()
        } else {
          setIsEnabled(false)
          toast({
            title: 'Não foi possível ativar',
            description: res.message || 'Verifique as permissões de notificação do navegador.',
            variant: 'destructive',
          })
        }
      } else {
        const res = await unsubscribeFromPush()
        if (res.success) {
          setIsEnabled(false)
          toast({
            title: 'Notificações desativadas',
            description: 'Este dispositivo não receberá mais avisos push em segundo plano.',
          })
          await checkStatus()
        } else {
          toast({
            title: 'Erro ao desativar',
            description: res.message,
            variant: 'destructive',
          })
        }
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar notificações',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsToggling(false)
    }
  }

  const handleTestPush = async () => {
    setIsTesting(true)
    try {
      const res = await sendTestPush()
      if (res.success) {
        toast({
          title: 'Notificação enviada!',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha no teste',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao testar envio',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Card className="border border-slate-200 bg-white">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BellRing className="w-5 h-5 text-primary" />
              Notificações Push no Celular (PWA)
            </CardTitle>
            <CardDescription className="mt-1">
              Receba alertas sonoros e avisos de tela cheia mesmo quando o navegador ou aplicativo
              estiver totalmente fechado.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {isEnabled ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Ativas neste aparelho
              </Badge>
            ) : (
              <Badge variant="outline" className="text-slate-500 border-slate-300 text-xs">
                Inativas
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Aviso caso navegador não suporte Web Push */}
        {!isSupported && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Navegador incompatível</strong>
              Seu navegador atual não dá suporte à Web Push API. Para receber alertas com o app
              fechado, utilize o Google Chrome, Microsoft Edge ou instale o app no Safari iOS 16.4+.
            </div>
          </div>
        )}

        {/* Aviso específico de iOS Standalone */}
        {iosWarning && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-950 text-xs flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block font-semibold text-blue-900">
                Aviso para usuários de iPhone / iPad (iOS):
              </strong>
              <p className="text-blue-800 leading-relaxed">{iosWarning}</p>
            </div>
          </div>
        )}

        {/* Bloco de Ativação Principal */}
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                Notificações no Celular / Dispositivo
              </h4>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                Avisos instantâneos de novas convocações, aceite ou recusa de turno, atrasos e
                faltas registrados no ponto e disputas abertas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                <Switch
                  id="push-notifications-toggle"
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                  disabled={!isSupported || isToggling}
                />
                <label
                  htmlFor="push-notifications-toggle"
                  className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  {isEnabled ? 'Ativado' : 'Desativado'}
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Estatísticas e Ações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Dispositivos Conectados</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {activeSubscriptionsCount} cadastrado(s)
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400">
              Cada celular, tablet ou computador onde você ativa as notificações gera uma inscrição
              única vinculada com segurança ao seu usuário.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">Testar Notificação</span>
              <p className="text-[11px] text-slate-400">
                Dispara um push de verificação para confirmar entrega.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestPush}
              disabled={!isEnabled || isTesting}
              className="text-xs shrink-0"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1 text-primary" />
              )}
              Enviar Teste
            </Button>
          </div>
        </div>

        {/* Resumo de Regras de Disparo */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 text-xs">
          <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-primary" />
            Eventos monitorados automaticamente pelo sistema:
          </h5>
          <ul className="list-disc pl-5 space-y-1 text-slate-600 text-[11px]">
            <li>
              <strong>Para Profissionais (Pros):</strong> Novas convocações de turnos criadas em
              postos designados.
            </li>
            <li>
              <strong>Para Gestores & Empresas:</strong> Convocações aceitas ou recusadas, atrasos e
              faltas no ponto.
            </li>
            <li>
              <strong>Para Administradores:</strong> Disputas de escrow abertas por profissionais e
              ocorrências de campo.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
