import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { SettingsRecord } from '@/types/facilities'
import { fetchSettings } from '@/services/pricing'

interface SettingsContextType {
  settings: SettingsRecord | null
  isLoading: boolean
  refreshSettings: () => Promise<void>
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
})

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsRecord | null>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    setIsLoading(true)
    const s = await fetchSettings()
    if (s) {
      setSettings(s)
      applyTheme(s)
    }
    setIsLoading(false)
  }

  const applyTheme = (s: SettingsRecord) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      if (s.cor_primaria) {
        root.style.setProperty('--primary-custom', s.cor_primaria)
      }
      if (s.cor_secundaria) {
        root.style.setProperty('--secondary-custom', s.cor_secundaria)
      }
    }
  }

  useEffect(() => {
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
      value={{ settings: settings || defaultSettings, isLoading, refreshSettings: load }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
