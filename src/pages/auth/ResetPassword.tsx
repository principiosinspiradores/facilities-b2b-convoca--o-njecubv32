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
import { Lock, ArrowLeft } from 'lucide-react'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { settings } = useSettings()

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const corPrimaria = settings?.cor_primaria || '#0F766E'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast({
        title: 'Token inválido',
        description: 'O link de recuperação parece expirado ou inválido.',
        variant: 'destructive',
      })
      return
    }

    if (password !== passwordConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha deve ser idêntica.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
      toast({
        title: 'Senha redefinida com sucesso!',
        description: 'Você já pode acessar sua conta com a nova senha.',
      })
      navigate('/login')
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao redefinir senha',
        description: 'Verifique se o link não expirou.',
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
          <CardTitle className="text-xl font-bold text-slate-900">Definir Nova Senha</CardTitle>
          <CardDescription>
            Crie uma nova senha de no mínimo 8 caracteres para sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Nova Senha</label>
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
                />
              </div>
            </div>

            <Button
              type="submit"
              style={{ backgroundColor: corPrimaria }}
              className="w-full text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? 'Redefinindo...' : 'Salvar Nova Senha'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="border-t border-slate-100 justify-center">
          <Link
            to="/login"
            className="text-xs text-teal-700 hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para o Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
