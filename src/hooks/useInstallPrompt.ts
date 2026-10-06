import { useState, useEffect, useCallback } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

// Armazenamento global do evento capturado precocemente
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>()

function notifyListeners() {
  listeners.forEach((listener) => listener(globalDeferredPrompt))
}

// Inicializar listener precocemente no escopo global do módulo
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Impede o mini-infobar padrão do navegador para controlarmos a instalação
    e.preventDefault()
    globalDeferredPrompt = e as BeforeInstallPromptEvent
    notifyListeners()
  })

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null
    notifyListeners()
  })
}

/**
 * Detecta se o navegador está rodando no iOS (iPhone/iPad/iPod)
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIos = /iPad|iPhone|iPod/.test(ua)
  // iPadOS em Macs com touch (iPad rodando Safari moderno)
  const isIpadOs = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
  return isIos || isIpadOs
}

/**
 * Detecta se o app está em modo standalone (já instalado e aberto como app PWA)
 */
export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const isStandaloneMatch = window.matchMedia('(display-mode: standalone)').matches
  const isIosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return Boolean(isStandaloneMatch || isIosStandalone)
}

/**
 * Hook para obter o estado de instalação do PWA e disparar a instalação nativa de 1 clique
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt,
  )
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isAppInstalled())
  const isIos = isIosDevice()

  useEffect(() => {
    // Atualizar se já estava guardado antes da montagem
    if (globalDeferredPrompt && !promptEvent) {
      setPromptEvent(globalDeferredPrompt)
    }

    const handleChange = (newPrompt: BeforeInstallPromptEvent | null) => {
      setPromptEvent(newPrompt)
    }

    listeners.add(handleChange)

    // Monitorar evento appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setPromptEvent(null)
    }

    // Monitorar mudança de display-mode
    const matchMediaStandalone = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true)
      }
    }

    window.addEventListener('appinstalled', handleAppInstalled)
    matchMediaStandalone.addEventListener?.('change', handleDisplayModeChange)

    return () => {
      listeners.delete(handleChange)
      window.removeEventListener('appinstalled', handleAppInstalled)
      matchMediaStandalone.removeEventListener?.('change', handleDisplayModeChange)
    }
  }, [promptEvent])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const prompt = globalDeferredPrompt || promptEvent
    if (!prompt) {
      return 'unavailable'
    }

    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
        globalDeferredPrompt = null
        setPromptEvent(null)
        notifyListeners()
      }
      return outcome
    } catch (err) {
      console.warn('[PWA] Erro ao disparar prompt de instalação:', err)
      return 'unavailable'
    }
  }, [promptEvent])

  return {
    canInstallNatively: Boolean(promptEvent || globalDeferredPrompt),
    promptEvent: promptEvent || globalDeferredPrompt,
    isInstalled,
    isIos,
    promptInstall,
  }
}
