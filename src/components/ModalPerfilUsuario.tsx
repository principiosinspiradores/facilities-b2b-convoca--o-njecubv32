import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import {
  User,
  Mail,
  Shield,
  BellRing,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  isPushNotificationSupported,
  checkIosRequiresInstallation,
  getActivePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
} from '@/services/pushNotifications'
import pb from '@/lib/pocketbase/client'

interface ModalPerfilUsuarioProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModalPerfilUsuario({ open, onOpenChange }: ModalPerfilUsuarioProps) {
  const { user, role, logout } = useAuth()
  const [isSupported, setIsSupported] = useState(true)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoadingPush, setIsLoadingPush] = useState(true)
  const [isToggling, setIsToggling] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [iosWarning, setIosWarning] = useState<string | null>(null)
  const [totalDevices, setTotalDevices] = useState(0)

  const checkPush = async () => {
    setIsLoadingPush(true)
    const supported = isPushNotificationSupported()
    setIsSupported(supported)

    if (!supported) {
      setIsLoadingPush(false)
      return
    }

    const iosCheck = checkIosRequiresInstallation()
    setIosWarning(iosCheck.requiresInstall ? iosCheck.message || null : null)

    try {
      const sub = await getActivePushSubscription()
      const permissionGranted =
        typeof Notification !== 'undefined' && Notification.permission === 'granted'
      setIsEnabled(Boolean(sub && permissionGranted))

      if (user?.id) {
        const list = await pb.collection('push_subscriptions').getList(1, 10, {
          filter: `user = "${user.id}"`,
        })
        setTotalDevices(list.totalItems)
      }
    } catch (err) {
      console.warn('Erro ao checar push:', err)
    } finally {
      setIsLoadingPush(false)
    }
  }

  useEffect(() => {
    if (open) {
      checkPush()
    }
  }, [open, user?.id])

  const handleTogglePush = async (checked: boolean) => {
    if (iosWarning) {
      toast({
        title: 'Instale o app primeiro',
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
            description: 'Você receberá avisos sonoros e em tela mesmo com o aplicativo fechado.',
          })
          await checkPush()
        } else {
          setIsEnabled(false)
          toast({
            title: 'Não foi possível ativar',
            description: res.message || 'Verifique as permissões do navegador.',
            variant: 'destructive',
          })
        }
      } else {
        const res = await unsubscribeFromPush()
        if (res.success) {
          setIsEnabled(false)
          toast({
            title: 'Notificações desativadas',
            description: 'Este aparelho não receberá mais notificações em segundo plano.',
          })
          await checkPush()
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
        title: 'Erro na alteração',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setIsToggling(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      const res = await sendTestPush()
      if (res.success) {
        toast({
          title: 'Teste enviado!',
          description: res.message,
        })
      } else {
        toast({
          title: 'Falha no envio',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }

  if (!user) return null

  const roleLabel =
    role === 'admin'
      ? 'Administrador Geral'
      : role === 'empresa'
        ? 'Gestor da Empresa'
        : 'Profissional Operacional (Pro)'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white text-slate-900 border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Perfil & Preferências de Notificação
          </DialogTitle>
          <DialogDescription className="text-xs">
            Gerencie seus dados de acesso e a recepção de alertas no celular.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card de Dados do Usuário */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-lg shrink-0">
                {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
              </div>
              <div className="overflow-hidden flex-1">
                <h4 className="font-bold text-slate-900 text-sm truncate">
                  {user.name || 'Usuário'}
                </h4>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Nível de Acesso:
              </span>
              <Badge variant="outline" className="font-medium capitalize text-slate-700 bg-white">
                {roleLabel}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Seção Push Notifications */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <BellRing className="w-4 h-4 text-primary" />
                Notificações no Celular (PWA)
              </div>
              {isEnabled && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-semibold gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Ativo
                </Badge>
              )}
            </div>

            {/* Aviso iOS */}
            {iosWarning && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-snug">{iosWarning}</p>
              </div>
            )}

            {!isSupported && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>Este navegador não suporta a Web Push API.</p>
              </div>
            )}

            {/* Toggle Switch */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <label
                  htmlFor="perfil-push-toggle"
                  className="text-xs font-semibold text-slate-800 block cursor-pointer select-none"
                >
                  Alertas em segundo plano
                </label>
                <p className="text-[11px] text-slate-500">
                  Receba avisos imediatos de turnos mesmo com o app fechado.
                </p>
              </div>

              {isLoadingPush ? (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              ) : (
                <Switch
                  id="perfil-push-toggle"
                  checked={isEnabled}
                  onCheckedChange={handleTogglePush}
                  disabled={!isSupported || isToggling}
                />
              )}
            </div>

            {/* Ação de teste rápida */}
            {isEnabled && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500 text-[11px]">
                  {totalDevices} aparelho(s) cadastrado(s)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="text-primary hover:text-primary/80 h-7 text-xs"
                >
                  {isTesting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3 mr-1" />
                  )}
                  Disparar teste agora
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false)
              logout()
            }}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs"
          >
            Sair da Conta
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
