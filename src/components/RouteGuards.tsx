import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { UserRole } from '@/types/facilities'

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export const RequireRole: React.FC<{ allowedRoles: UserRole[]; children: React.ReactNode }> = ({
  allowedRoles,
  children,
}) => {
  const { role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }
  if (role === 'anon') {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(role as UserRole)) {
    // Redireciona para o home padrão do papel
    if (role === 'pro') return <Navigate to="/convocacoes" replace />
    if (role === 'empresa') return <Navigate to="/postos" replace />
    if (role === 'admin') return <Navigate to="/gate" replace />
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
