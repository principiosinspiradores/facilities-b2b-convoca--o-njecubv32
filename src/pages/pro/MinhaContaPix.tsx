import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ContaPixRecord, PixTipoChave } from '@/types/facilities'
import { formatarCPF } from '@/lib/cpf'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { CreditCard, QrCode, ShieldCheck, Info } from 'lucide-react'

export default function MinhaContaPixPage() {
  const { user } = useAuth()
  const [contaPix, setContaPix] = useState<ContaPixRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [tipoChave, setTipoChave] = useState<PixTipoChave>('cpf')
  const [chave, setChave] = useState('')
  const [provedorConta, setProvedorConta] = useState('mercadopago')
  const [contaReferencia, setContaReferencia] = useState('')

  useEffect(() => {
    async function loadPix() {
      if (!user) return
      setIsLoading(true)
      try {
        const list = await pb.collection('conta_pix').getList<ContaPixRecord>(1, 1, {
          filter: `pro = "${user.id}"`,
          sort: '-created',
        })

        if (list.items.length > 0) {
          const cp = list.items[0]
          setContaPix(cp)
          setTipoChave(cp.tipo_chave)
          setChave(cp.chave)
          setProvedorConta(cp.provedor_conta || 'mercadopago')
          setContaReferencia(cp.conta_referencia || '')
        } else if (user.cpf) {
          // Pré-preencher chave com o CPF do usuário se ainda não configurada
          setChave(formatarCPF(user.cpf))
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    loadPix()
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!chave.trim()) {
      toast({
        title: 'Chave Pix obrigatória',
        description: 'Preencha a sua chave Pix para receber os repasses.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const data = {
        pro: user.id,
        tipo_chave: tipoChave,
        chave: chave.trim(),
        provedor_conta: provedorConta.trim() || 'mercadopago',
        conta_referencia: contaReferencia.trim(),
      }

      if (contaPix) {
        const updated = await pb.collection('conta_pix').update<ContaPixRecord>(contaPix.id, data)
        setContaPix(updated)
      } else {
        const created = await pb.collection('conta_pix').create<ContaPixRecord>(data)
        setContaPix(created)
      }

      toast({
        title: 'Dados Pix salvos!',
        description: 'Sua chave foi validada e vinculada aos seus futuros repasses de escrow.',
      })
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar',
        description: 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <QrCode className="w-6 h-6 text-primary" />
          Minha Conta Pix & Recebimentos
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Configure a chave Pix e conta Mercado Pago onde você deseja receber a liquidação das suas
          diárias de trabalho.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-slate-900">Destino de Liquidação</CardTitle>
          <CardDescription>
            Os pagamentos são liberados diretamente nesta chave após o período de garantia da diária
            cumprida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipo de Chave *
                  </label>
                  <Select
                    value={tipoChave}
                    onValueChange={(v) => {
                      const novoTipo = v as PixTipoChave
                      setTipoChave(novoTipo)
                      // Se selecionar CPF e o pro já possuir CPF cadastrado, pré-preencher
                      if (novoTipo === 'cpf' && user?.cpf && (!chave || chave === user.email)) {
                        setChave(formatarCPF(user.cpf))
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="telefone">Telefone (Celular)</SelectItem>
                      <SelectItem value="aleatoria">Chave Aleatória (EVP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Chave Pix *
                  </label>
                  <Input
                    value={chave}
                    onChange={(e) => {
                      const val = e.target.value
                      if (tipoChave === 'cpf') {
                        setChave(formatarCPF(val))
                      } else {
                        setChave(val)
                      }
                    }}
                    placeholder={
                      tipoChave === 'cpf'
                        ? '000.000.000-00'
                        : tipoChave === 'email'
                          ? 'seu.email@dominio.com'
                          : tipoChave === 'telefone'
                            ? '(11) 99999-9999'
                            : 'Informe sua chave'
                    }
                    maxLength={tipoChave === 'cpf' ? 14 : undefined}
                    required
                  />
                  {tipoChave === 'cpf' && user?.cpf && (
                    <span className="text-[10px] text-primary block mt-1">
                      Pré-preenchido com o CPF cadastrado no seu perfil ({formatarCPF(user.cpf)}).
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Provedor / Instituição
                  </label>
                  <Input
                    value={provedorConta}
                    onChange={(e) => setProvedorConta(e.target.value)}
                    placeholder="mercadopago"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Padrão Mercado Pago Pix.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Conta / E-mail de Referência (Opcional)
                  </label>
                  <Input
                    value={contaReferencia}
                    onChange={(e) => setContaReferencia(e.target.value)}
                    placeholder="seu.email@mercadopago.com"
                  />
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-slate-900 flex items-start gap-2 mt-4">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Garantia e Segurança:</span> Seus dados bancários são
                  armazenados com segurança. Nenhuma transação bancária em tempo real ocorre no seu
                  dispositivo — a liquidação de escrow é processada pela esteira de auditoria da
                  plataforma.
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button type="submit" className="font-medium px-6" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar Chave Pix'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
