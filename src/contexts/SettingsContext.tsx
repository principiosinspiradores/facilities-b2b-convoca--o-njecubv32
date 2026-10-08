import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { SettingsRecord } from '@/types/facilities'
import { fetchSettings } from '@/services/pricing'

interface SettingsContextType {
  settings: SettingsRecord | null
  isLoading: boolean
  refreshSettings: () => Promise<void>
  applyTheme: (s: SettingsRecord | { cor_primaria?: string; cor_secundaria?: string }) => void
}

export function hexToHsl(hex: string): { h: number; s: number; l: number; str: string } {
  let cleaned = hex.trim().replace(/^#/, '')
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (cleaned.length !== 6) {
    // Fallback padrão se hex inválido (#0F766E -> 173 78% 26%)
    return { h: 173, s: 78, l: 26, str: '173 78% 26%' }
  }

  const num = parseInt(cleaned, 16)
  if (isNaN(num)) {
    return { h: 173, s: 78, l: 26, str: '173 78% 26%' }
  }

  const r = (num >> 16) / 255
  const g = ((num >> 8) & 255) / 255
  const b = (num & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h = Math.round(h * 60)
  }

  const sPercent = Math.round(s * 100)
  const lPercent = Math.round(l * 100)
  return {
    h,
    s: sPercent,
    l: lPercent,
    str: `${h} ${sPercent}% ${lPercent}%`,
  }
}

export function getForegroundHsl(l: number): string {
  return l < 60 ? '0 0% 100%' : '222.2 84% 4.9%'
}

export function applyTheme(
  s: Partial<SettingsRecord> | { cor_primaria?: string; cor_secundaria?: string },
) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const corPrimaria = s.cor_primaria || '#0F766E'
  const corSecundaria = s.cor_secundaria || '#134E4A'

  const primaryHsl = hexToHsl(corPrimaria)
  const secondaryHsl = hexToHsl(corSecundaria)

  // --primary e --ring = HSL da primária; --primary-foreground = getForegroundHsl(primária)
  root.style.setProperty('--primary', primaryHsl.str)
  root.style.setProperty('--ring', primaryHsl.str)
  root.style.setProperty('--primary-foreground', getForegroundHsl(primaryHsl.l))

  // --secondary = HSL da secundária; --secondary-foreground = getForegroundHsl(secundária)
  root.style.setProperty('--secondary', secondaryHsl.str)
  root.style.setProperty('--secondary-foreground', getForegroundHsl(secondaryHsl.l))

  // --sidebar-background = HSL da secundária
  root.style.setProperty('--sidebar-background', secondaryHsl.str)

  // --accent = primária com luminosidade 95%; --accent-foreground = primária
  root.style.setProperty('--accent', `${primaryHsl.h} ${primaryHsl.s}% 95%`)
  root.style.setProperty('--accent-foreground', primaryHsl.str)

  // manter também --primary-custom / --secondary-custom para retrocompatibilidade
  root.style.setProperty('--primary-custom', corPrimaria)
  root.style.setProperty('--secondary-custom', corSecundaria)

  // Atualizar meta theme-color para navegadores móveis e status bar refletirem o tema white label
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', corPrimaria)
  }
}

const defaultSettings: SettingsRecord = {
  id: '',
  nome_empresa: 'Facilities Pro',
  cor_primaria: '#0F766E',
  cor_secundaria: '#134E4A',
  guarantee_period_days: 7,
  dispute_period_hours: 24,
  payout_provider: 'mercadopago',
  multa_falta_pro: 50,
  multa_empresa_cancelamento: 0,
  created: '',
  updated: '',
}

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  isLoading: true,
  refreshSettings: async () => {},
  applyTheme: () => {},
})

const SETTINGS_CACHE_KEY = 'facilities_theme_settings_cached'

function getInitialSettings(): SettingsRecord {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && (parsed.cor_primaria || parsed.nome_empresa)) {
          return { ...defaultSettings, ...parsed }
        }
      }
    } catch {
      // Ignora falhas de parse
    }
  }
  return defaultSettings
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsRecord | null>(getInitialSettings)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    const s = await fetchSettings()
    if (s) {
      setSettings(s)
      applyTheme(s)
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(s))
      } catch {
        // Ignora falha de armazenamento local
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    // Aplica as cores imediatamente do cache persistido (evita flash verde da marca de fábrica no boot do PWA)
    const initial = getInitialSettings()
    applyTheme(initial)
    load()

    // Subscribe para realtime em settings se mudar white-label
    let unsub: (() => void) | undefined
    pb.collection('settings')
      .subscribe('*', () => {
        load()
      })
      .then((u) => {
        unsub = u
      })
      .catch(() => {})

    return () => {
      if (unsub) unsub()
    }
  }, [])

  return (
    <SettingsContext.Provider
      value={{
        settings: settings || defaultSettings,
        isLoading,
        refreshSettings: load,
        applyTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
