import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { Lock, Mail, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const successStateMessage = (location.state as any)?.successMessage

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const corPrimaria = settings?.cor_primaria || '#0F766E'
  const nomeEmpresa = settings?.nome_empresa || 'Facilities Pro'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setIsLoading(true)

    try {
      await login(email.trim(), password)
      toast({
        title: 'Bem-vindo ao sistema!',
        description: 'Autenticação realizada com sucesso.',
      })
      navigate('/')
    } catch (err: any) {
      console.error(err)
      setErrorMessage('Credenciais inválidas. Verifique seu e-mail e senha.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100/80">
      <div className="w-full max-w-md space-y-6">
        {/* Cabeçalho White Label */}
        <div className="text-center space-y-2">
          <div
            style={{ backgroundColor: corPrimaria }}
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl text-white shadow-lg"
          >
            {nomeEmpresa.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{nomeEmpresa}</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
            Marketplace Fechado &bullet; Convocação B2B
          </p>
        </div>

        <Card className="border border-slate-200 shadow-xl bg-white">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">Acesse sua conta</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Contas corporativas e de profissionais são criadas pela administração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {successStateMessage && !errorMessage && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successStateMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  E-mail corporativo / profissional
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@dominio.com"
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-700">Senha</label>
                  <a href="/forgot-password" className="text-xs text-primary hover:underline">
                    Esqueceu a senha?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                style={{ backgroundColor: corPrimaria }}
                className="w-full text-white font-semibold hover:opacity-95 shadow"
                disabled={isLoading}
              >
                {isLoading ? 'Autenticando...' : 'Entrar no Portal'}
                {!isLoading && <ArrowRight className="w-4 h-4 ml-1.5" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
