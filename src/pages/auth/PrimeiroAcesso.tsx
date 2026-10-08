import React, { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useSettings } from '@/contexts/SettingsContext'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { Lock, ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react'

export default function PrimeiroAcessoPage() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') || '').trim()
  const navigate = useNavigate()
  const { settings } = useSettings()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorStatus, setErrorStatus] = useState<string | null>(null)

  const corPrimaria = settings?.cor_primaria || '#0F766E'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorStatus(null)

    if (!token) {
      toast({
        title: 'Token inválido',
        description: 'O link de primeiro acesso parece incompleto ou ausente.',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve conter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (password !== passwordConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha deve ser idêntica à nova senha.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await pb.send<{
        success: boolean
        message: string
        email?: string
      }>('/backend/v1/auth/primeiro-acesso', {
        method: 'POST',
        body: {
          token,
          password,
          passwordConfirm,
        },
      })

      toast({
        title: 'Acesso criado com sucesso!',
        description: response.message || 'Senha criada! Faça login com seu e-mail e senha.',
      })

      navigate('/login', {
        replace: true,
        state: {
          successMessage: 'Conta ativada com sucesso! Faça login com seu e-mail e sua nova senha.',
        },
      })
    } catch (err: any) {
      console.error('Erro ao definir senha de primeiro acesso:', err)
      const errCode = err?.data?.code || ''
      const errorMsg =
        err?.data?.error ||
        err?.data?.message ||
        err?.message ||
        'Não foi possível ativar sua conta.'

      if (errCode === 'TOKEN_EXPIRED' || errorMsg.toLowerCase().includes('expir')) {
        setErrorStatus('expired')
      } else if (
        errCode === 'TOKEN_ALREADY_USED' ||
        errorMsg.toLowerCase().includes('utilizado') ||
        errorMsg.toLowerCase().includes('já foi')
      ) {
        setErrorStatus('used')
      } else {
        setErrorStatus('invalid')
      }

      toast({
        title: 'Link inválido ou expirado',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100/80">
      <Card className="w-full max-w-md border border-slate-200 shadow-xl bg-white">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div
              style={{ backgroundColor: corPrimaria }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">
              Primeiro Acesso do Profissional
            </CardTitle>
          </div>
          <CardDescription>
            Defina sua senha de no mínimo 8 caracteres para ativar sua conta e liberar seu acesso à
            plataforma.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Mensagem orientativa caso token esteja ausente ou ocorra erro de token */}
          {!token && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Nenhum token encontrado na URL.</span>
              </div>
              <p>
                Este link parece incompleto. Use &quot;Esqueci minha senha&quot; na tela de login ou
                peça o reenvio do convite à gestão.
              </p>
            </div>
          )}

          {errorStatus === 'expired' && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Este link de primeiro acesso expirou (validade de 24 horas).</span>
              </div>
              <p className="leading-relaxed">
                Use <strong>&quot;Esqueci minha senha&quot;</strong> na tela de login ou peça o
                reenvio do convite à gestão para receber um novo link.
              </p>
            </div>
          )}

          {errorStatus === 'used' && (
            <div className="mb-4 p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-blue-800">
                <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Este convite já foi utilizado anteriormente.</span>
              </div>
              <p className="leading-relaxed">
                Sua senha já foi definida. Caso tenha esquecido, use{' '}
                <strong>&quot;Esqueci minha senha&quot;</strong> na tela de login ou peça o reenvio
                do convite à gestão.
              </p>
            </div>
          )}

          {errorStatus === 'invalid' && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Link de convite inválido ou não reconhecido.</span>
              </div>
              <p className="leading-relaxed">
                Verifique se copiou o link completo do e-mail. Se o problema persistir, use{' '}
                <strong>&quot;Esqueci minha senha&quot;</strong> na tela de login ou peça o reenvio
                do convite à gestão.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Nova Senha (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 text-sm"
                  minLength={8}
                  required
                  disabled={!token || isLoading}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Confirmação da Nova Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 text-sm"
                  minLength={8}
                  required
                  disabled={!token || isLoading}
                />
              </div>
            </div>

            <Button
              type="submit"
              style={{ backgroundColor: corPrimaria }}
              className="w-full text-white font-semibold shadow-xs"
              disabled={isLoading || !token}
            >
              {isLoading ? 'Ativando conta...' : 'Criar minha Senha e Ativar Acesso'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="border-t border-slate-100 justify-center">
          <Link
            to="/login"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para o Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
