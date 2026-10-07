import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { UserRecord, UserRole } from '@/types/facilities'

interface AuthContextType {
  user: UserRecord | null
  role: UserRole | 'anon'
  isLoading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: 'anon',
  isLoading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const syncUser = () => {
    if (pb.authStore.isValid && pb.authStore.model) {
      const u = pb.authStore.model as unknown as UserRecord
      setUser(u)
    } else {
      setUser(null)
    }
  }

  const refreshUser = async () => {
    if (pb.authStore.isValid && pb.authStore.model?.id) {
      try {
        const u = await pb.collection('users').getOne<UserRecord>(pb.authStore.model.id)
        setUser(u)
      } catch (err) {
        console.warn('Erro ao atualizar usuário:', err)
      }
    }
  }

  useEffect(() => {
    syncUser()
    setIsLoading(false)

    const unsubscribe = pb.authStore.onChange(() => {
      syncUser()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    const authData = await pb.collection('users').authWithPassword(email, pass)
    // Tenta também registrar client-side caso o hook backend não tenha persistido antes da resposta
    try {
      const nowIso = new Date().toISOString()
      if (authData.record?.id) {
        await pb.collection('users').update(authData.record.id, {
          ultimo_acesso: nowIso,
          emailVisibility: true,
        })
      }
    } catch (_) {
      // Ignora silenciosamente caso o usuário não tenha permissão de update ou já tenha sido atualizado pelo hook
    }
    syncUser()
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
  }

  const role: UserRole | 'anon' = user?.role || (user ? 'pro' : 'anon')

  return (
    <AuthContext.Provider value={{ user, role, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
