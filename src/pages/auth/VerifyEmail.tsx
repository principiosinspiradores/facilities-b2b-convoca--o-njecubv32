import React, { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')

  useEffect(() => {
    async function verify() {
      if (!token) {
        setStatus('error')
        return
      }
      try {
        await pb.collection('users').confirmVerification(token)
        setStatus('success')
      } catch (err) {
        console.error(err)
        setStatus('error')
      }
    }
    verify()
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100/80">
      <Card className="w-full max-w-md border border-slate-200 shadow-xl bg-white text-center">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">Verificação de E-mail</CardTitle>
          <CardDescription>
            Confirmação cadastral de conta no sistema de Facilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          {status === 'verifying' && (
            <div className="space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm text-slate-600">Validando autenticidade do seu endereço...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="font-bold text-slate-900">E-mail verificado com sucesso!</h3>
              <p className="text-xs text-slate-500">
                Sua conta foi ativada. Você já pode fazer login no sistema.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <XCircle className="w-12 h-12 text-rose-600 mx-auto" />
              <h3 className="font-bold text-slate-900">Falha na verificação</h3>
              <p className="text-xs text-slate-500">
                O token expirou ou é inválido. Solicite novo link se necessário.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t border-slate-100">
          <Link
            to="/login"
            className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Ir para o Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
