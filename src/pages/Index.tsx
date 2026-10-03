import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function IndexPage() {
  const { user, role, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role === 'pro') {
    return <Navigate to="/convocacoes" replace />
  }

  if (role === 'empresa') {
    return <Navigate to="/postos" replace />
  }

  if (role === 'admin') {
    return <Navigate to="/gate" replace />
  }

  return <Navigate to="/login" replace />
}
