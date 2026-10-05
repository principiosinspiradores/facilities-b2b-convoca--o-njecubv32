import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
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
import { CheckCircle2, Lock, ArrowLeft } from 'lucide-react'

export default function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setIsLoading(true)
    try {
      await pb.collection('users').confirmEmailChange(token, password)
      logout()
      toast({
        title: 'E-mail alterado com sucesso!',
        description: 'Faça login com seu novo endereço de e-mail.',
      })
      navigate('/login')
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao confirmar alteração',
        description: 'Verifique se a senha informada está correta.',
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
          <CardTitle className="text-xl font-bold text-slate-900">
            Confirmar Troca de E-mail
          </CardTitle>
          <CardDescription>
            Digite sua senha atual para homologar a alteração do seu e-mail cadastral.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Senha Atual</label>
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

            <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
              {isLoading ? 'Confirmando...' : 'Confirmar Alteração'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t border-slate-100">
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
