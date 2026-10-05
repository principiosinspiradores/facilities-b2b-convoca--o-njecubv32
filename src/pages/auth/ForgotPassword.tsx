import React, { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const { settings } = useSettings()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const corPrimaria = settings?.cor_primaria || '#0F766E'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSubmitted(true)
      toast({
        title: 'E-mail de recuperação enviado',
        description: 'Verifique sua caixa de entrada para redefinir a senha.',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao solicitar recuperação',
        description: 'Tente novamente.',
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
          <CardTitle className="text-xl font-bold text-slate-900">Recuperação de Senha</CardTitle>
          <CardDescription>
            Informe seu e-mail cadastrado para receber o link seguro de redefinição de acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="font-bold text-slate-900">Instruções enviadas!</h3>
              <p className="text-xs text-slate-500">
                Se o e-mail estiver cadastrado em nossa base, você receberá um link nos próximos
                minutos.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">E-mail</label>
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

              <Button
                type="submit"
                style={{ backgroundColor: corPrimaria }}
                className="w-full text-white font-semibold"
                disabled={isLoading}
              >
                {isLoading ? 'Enviando...' : 'Enviar Link de Redefinição'}
              </Button>
            </form>
          )}
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
