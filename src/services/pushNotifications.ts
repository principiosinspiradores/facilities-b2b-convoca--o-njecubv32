import pb from '@/lib/pocketbase/client'
import { isIosDevice, isAppInstalled } from '@/hooks/useInstallPrompt'

// Chave pública de contingência VAPID caso a rota do backend esteja inacessível
const FALLBACK_VAPID_PUBLIC_KEY =
  'BN8vQj4x5m3nL8yR1wK6vP9zT2uO7qS5jA3dM8eX2yL9zB4cV7nP1mO6rT8uE3yL9zB4cV7nP1mO6rT8uE3yL9w'

const PROMPT_REQUESTED_STORAGE_KEY = 'facilities_push_permission_prompted'

/**
 * Converte base64 URL safe para Uint8Array para aplicação na subscription VAPID
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Converte ArrayBuffer para string base64 url-safe
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Busca a chave VAPID pública exposta pelo backend
 */
export async function getVapidPublicKey(): Promise<string> {
  try {
    const res = await pb.send<{ publicKey: string }>('/backend/v1/push/vapid-public-key', {
      method: 'GET',
    })
    if (res?.publicKey) {
      return res.publicKey
    }
  } catch (err) {
    console.warn('[Push] Não foi possível obter VAPID do backend, usando fallback:', err)
  }
  return FALLBACK_VAPID_PUBLIC_KEY
}

/**
 * Verifica se o navegador suporta Web Push e Notificações
 */
export function isPushNotificationSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Verifica se o dispositivo iOS precisa ser instalado na tela de início primeiro
 */
export function checkIosRequiresInstallation(): { requiresInstall: boolean; message?: string } {
  const isIos = isIosDevice()
  const isInstalled = isAppInstalled()

  if (isIos && !isInstalled) {
    return {
      requiresInstall: true,
      message:
        'No iPhone/iPad (iOS), as notificações push só funcionam após adicionar o aplicativo à Tela de Início. Toque no ícone Compartilhar e selecione "Adicionar à Tela de Início".',
    }
  }

  return { requiresInstall: false }
}

/**
 * Obtém a assinatura push local ativa
 */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) return null
  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch (err) {
    console.warn('[Push] Erro ao obter subscription ativa:', err)
    return null
  }
}

/**
 * Registra a subscription push no navegador e salva na coleção push_subscriptions do PocketBase
 */
export async function subscribeToPush(): Promise<{ success: boolean; message?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, message: 'Seu navegador não suporta notificações push.' }
  }

  const iosCheck = checkIosRequiresInstallation()
  if (iosCheck.requiresInstall) {
    return { success: false, message: iosCheck.message }
  }

  const currentUser = pb.authStore.model
  if (!currentUser) {
    return { success: false, message: 'Usuário precisa estar autenticado.' }
  }

  try {
    // 1. Solicitar permissão se não concedida
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }

    if (permission !== 'granted') {
      return {
        success: false,
        message: 'Permissão para notificações foi negada no navegador.',
      }
    }

    // 2. Obter Service Worker Registration
    const registration = await navigator.serviceWorker.ready

    // 3. Obter ou criar PushSubscription
    const vapidKey = await getVapidPublicKey()
    const convertedVapidKey = urlBase64ToUint8Array(vapidKey)

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      })
    }

    const endpoint = subscription.endpoint
    const p256dh = arrayBufferToBase64Url(subscription.getKey('p256dh'))
    const auth = arrayBufferToBase64Url(subscription.getKey('auth'))
    const userAgent = navigator.userAgent.slice(0, 500)

    // 4. Salvar ou atualizar no PocketBase
    try {
      // Verificar se a subscription já existe pelo endpoint único
      const existing = await pb
        .collection('push_subscriptions')
        .getFirstListItem(`endpoint = "${endpoint}"`)
      if (existing) {
        if (existing.user !== currentUser.id) {
          await pb.collection('push_subscriptions').update(existing.id, {
            user: currentUser.id,
            keys_p256dh: p256dh,
            keys_auth: auth,
            useragent: userAgent,
          })
        }
      }
    } catch (_) {
      // Não existe ainda, criar novo registro
      await pb.collection('push_subscriptions').create({
        user: currentUser.id,
        endpoint,
        keys_p256dh: p256dh,
        keys_auth: auth,
        useragent: userAgent,
      })
    }

    return { success: true, message: 'Notificações ativadas com sucesso!' }
  } catch (err: any) {
    console.error('[Push] Erro ao registrar notificação push:', err)
    return {
      success: false,
      message: err?.message || 'Falha ao registrar notificações no aparelho.',
    }
  }
}

/**
 * Cancela a subscription push ativa e remove da base do PocketBase
 */
export async function unsubscribeFromPush(): Promise<{ success: boolean; message?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: true }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      // Remover do banco
      try {
        const records = await pb.collection('push_subscriptions').getFullList({
          filter: `endpoint = "${endpoint}"`,
        })
        for (const rec of records) {
          await pb.collection('push_subscriptions').delete(rec.id)
        }
      } catch (dbErr) {
        console.warn('[Push] Erro ao remover subscription do PocketBase:', dbErr)
      }
    }

    return { success: true, message: 'Notificações desativadas com sucesso.' }
  } catch (err: any) {
    console.error('[Push] Erro ao desinscrever:', err)
    return { success: false, message: 'Não foi possível desativar as notificações.' }
  }
}

/**
 * Solicitação única pós-login/primeiro acesso: pede permissão uma única vez, sem insistir.
 */
export async function promptPushPermissionOnce(userId: string): Promise<void> {
  if (!isPushNotificationSupported()) return

  // iOS: antes de pedir permissão, precisa estar em modo standalone
  const iosCheck = checkIosRequiresInstallation()
  if (iosCheck.requiresInstall) return

  // Se já concedido ou negado
  if (Notification.permission === 'denied') return

  const promptKey = `${PROMPT_REQUESTED_STORAGE_KEY}_${userId}`
  const alreadyPrompted = localStorage.getItem(promptKey)
  if (alreadyPrompted) return

  localStorage.setItem(promptKey, 'true')

  if (Notification.permission === 'default') {
    try {
      const result = await Notification.requestPermission()
      if (result === 'granted') {
        await subscribeToPush()
      }
    } catch (err) {
      console.warn('[Push] Falha ao solicitar permissão única:', err)
    }
  } else if (Notification.permission === 'granted') {
    // Permissão já estava concedida no browser, garantir inscrição salva no PocketBase
    await subscribeToPush()
  }
}

/**
 * Dispara envio de notificação de teste para o próprio usuário autenticado
 */
export async function gerarChavesVapid(
  force = false,
): Promise<{ success: boolean; message: string; publicKey?: string; alreadyConfigured?: boolean }> {
  try {
    const res = await pb.send<{
      success?: boolean
      message?: string
      error?: string
      publicKey?: string
    }>(`/backend/v1/push/gerar-vapid${force ? '?force=true' : ''}`, {
      method: 'POST',
    })

    return {
      success: true,
      message: res?.message || 'Chaves VAPID geradas com sucesso!',
      publicKey: res?.publicKey,
    }
  } catch (err: any) {
    const status = err?.status || err?.statusCode
    const data = err?.data || {}
    if (status === 409 || data.error === 'ALREADY_CONFIGURED') {
      return {
        success: false,
        alreadyConfigured: true,
        publicKey: data.publicKey,
        message:
          data.message ||
          'Chaves já existentes — regenerar invalida as inscrições atuais dos aparelhos.',
      }
    }
    return {
      success: false,
      message:
        err?.message || data.error || 'Erro ao comunicar com o gerador de chaves do servidor.',
    }
  }
}

export async function sendTestPush(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await pb.send<{
      totalSubscricoes: number
      enviados: number
      removidos: number
      erros: number
    }>('/backend/v1/push/test', {
      method: 'POST',
    })
    if (res && res.totalSubscricoes === 0) {
      return {
        success: false,
        message: 'Nenhum dispositivo cadastrado para este usuário. Ative as notificações primeiro.',
      }
    }

    // Se o navegador suportar Service Worker e Notification localmente,
    // verifica e exibe imediatamente a notificação de teste para feedback instantâneo na UI
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready
        if (reg) {
          reg.showNotification('Teste de Notificação Push', {
            body: 'Seu dispositivo está configurado e pronto para receber notificações de convocações e alertas!',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'teste-local-' + Date.now(),
            data: { url: '/convocacoes' },
          })
        }
      }
    } catch {
      /* intentionally ignored */
    }

    return {
      success: true,
      message: `Teste enviado para ${res.totalSubscricoes} aparelho(s) cadastrado(s)!`,
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro ao enviar notificação de teste.',
    }
  }
}
