import React, { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { PostoRecord, PostoFuncao, UserRecord, TipoRemuneracaoFixa } from '@/types/facilities'
import { formatDateBR, formatCurrencyBRL } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import {
  Building2,
  Plus,
  MapPin,
  Clock,
  Edit2,
  CheckCircle2,
  XCircle,
  UserCheck,
  Search,
  DollarSign,
  Briefcase,
} from 'lucide-react'

export default function PostosPage() {
  const [postos, setPostos] = useState<PostoRecord[]>([])
  const [pros, setPros] = useState<UserRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal Novo / Editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPosto, setEditingPosto] = useState<PostoRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form states
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState<PostoFuncao>('porteiro')
  const [cargaHoraria, setCargaHoraria] = useState(8)
  const [status, setStatus] = useState<'ativo' | 'inativo'>('ativo')
  const [vigenciaInicio, setVigenciaInicio] = useState('')
  const [vigenciaFim, setVigenciaFim] = useState('')
  const [requisitos, setRequisitos] = useState('')

  // Profissional Fixa por Posto
  const [proFixoId, setProFixoId] = useState<string>('nenhum')
  const [tipoRemuneracaoFixa, setTipoRemuneracaoFixa] = useState<TipoRemuneracaoFixa>('mensal')
  const [valorRemuneracaoFixa, setValorRemuneracaoFixa] = useState<number>(2200)
  const [buscaPro, setBuscaPro] = useState('')

  // Endereço
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('SP')
  const [cep, setCep] = useState('')

  const loadPostos = async () => {
    setIsLoading(true)
    try {
      const [postosRes, prosRes] = await Promise.all([
        pb.collection('postos').getFullList<PostoRecord>({
          sort: '-created',
          expand: 'pro_fixo',
        }),
        pb.collection('users').getFullList<UserRecord>({
          filter: 'role = "pro"',
          sort: 'name',
        }),
      ])
      setPostos(postosRes)
      setPros(prosRes)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados dos postos',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPostos()
  }, [])

  const openNewModal = () => {
    setEditingPosto(null)
    setNome('')
    setFuncao('porteiro')
    setCargaHoraria(8)
    setStatus('ativo')
    setVigenciaInicio('2025-01-01')
    setVigenciaFim('2026-12-31')
    setRequisitos('')
    setProFixoId('nenhum')
    setTipoRemuneracaoFixa('mensal')
    setValorRemuneracaoFixa(2200)
    setBuscaPro('')
    setLogradouro('')
    setNumero('')
    setBairro('')
    setCidade('São Paulo')
    setUf('SP')
    setCep('')
    setModalOpen(true)
  }

  const openEditModal = (posto: PostoRecord) => {
    setEditingPosto(posto)
    setNome(posto.nome)
    setFuncao(posto.funcao)
    setCargaHoraria(posto.carga_horaria || 8)
    setStatus(posto.status)
    setVigenciaInicio((posto.vigencia_inicio || '').slice(0, 10))
    setVigenciaFim((posto.vigencia_fim || '').slice(0, 10))
    setRequisitos(posto.requisitos || '')

    setProFixoId(posto.pro_fixo || 'nenhum')
    setTipoRemuneracaoFixa(posto.tipo_remuneracao_fixa || 'mensal')
    setValorRemuneracaoFixa(
      posto.valor_remuneracao_fixa !== undefined
        ? posto.valor_remuneracao_fixa
        : posto.tipo_remuneracao_fixa === 'por_hora'
          ? 25
          : 2200,
    )
    setBuscaPro('')

    const end = (posto.endereco as any) || {}
    setLogradouro(end.logradouro || '')
    setNumero(end.numero || '')
    setBairro(end.bairro || '')
    setCidade(end.cidade || '')
    setUf(end.uf || 'SP')
    setCep(end.cep || '')

    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim() || !cidade.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o nome do posto e a cidade.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const hasProFixo = proFixoId && proFixoId !== 'nenhum'
      const payload: Record<string, any> = {
        nome: nome.trim(),
        funcao,
        carga_horaria: Number(cargaHoraria),
        status,
        vigencia_inicio: vigenciaInicio ? new Date(vigenciaInicio).toISOString() : null,
        vigencia_fim: vigenciaFim ? new Date(vigenciaFim).toISOString() : null,
        requisitos: requisitos.trim(),
        pro_fixo: hasProFixo ? proFixoId : null,
        tipo_remuneracao_fixa: hasProFixo ? tipoRemuneracaoFixa : null,
        valor_remuneracao_fixa: hasProFixo ? Number(valorRemuneracaoFixa) : null,
        endereco: {
          logradouro: logradouro.trim(),
          numero: numero.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim().toUpperCase(),
          cep: cep.trim(),
        },
      }

      if (editingPosto) {
        await pb.collection('postos').update(editingPosto.id, payload)
        toast({ title: 'Posto atualizado com sucesso!' })
      } else {
        await pb.collection('postos').create(payload)
        toast({ title: 'Novo posto cadastrado com sucesso!' })
      }

      setModalOpen(false)
      loadPostos()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao salvar posto',
        description: 'Verifique as informações preenchidas.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-700" />
            Postos de Trabalho & Alocações
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Cadastre e gerencie as unidades clientes onde as escalas de portaria, limpeza e
            zeladoria são executadas.
          </p>
        </div>
        <Button
          onClick={openNewModal}
          className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Posto
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : postos.length === 0 ? (
        <Card className="text-center py-12 border-dashed border-2 border-slate-200">
          <CardContent className="space-y-3">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-700">Nenhum posto cadastrado</h3>
            <p className="text-sm text-slate-400">
              Clique em "Novo Posto" para registrar a primeira unidade.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {postos.map((p) => {
            const end = (p.endereco as any) || {}
            const isAtivo = p.status === 'ativo'

            return (
              <Card
                key={p.id}
                className="border border-slate-200 bg-white hover:shadow-sm transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="bg-teal-50 text-teal-800 border-teal-200 uppercase text-[11px] font-semibold"
                    >
                      {p.funcao}
                    </Badge>
                    <Badge
                      variant={isAtivo ? 'default' : 'secondary'}
                      className={isAtivo ? 'bg-emerald-600' : 'bg-slate-300'}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900 mt-2">{p.nome}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-slate-600 text-xs">
                    <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>
                      Carga Horária Padrão: <strong>{p.carga_horaria}h / turno</strong>
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-500 text-xs">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {end.logradouro
                        ? `${end.logradouro}, ${end.numero} - ${end.bairro}, ${end.cidade}/${end.uf}`
                        : 'Endereço não informado'}
                    </span>
                  </div>
                  {p.requisitos && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100 line-clamp-2">
                      <strong>Requisitos:</strong> {p.requisitos}
                    </div>
                  )}
                  {/* Seção Profissional Fixa */}
                  <div className="pt-2 border-t border-slate-100">
                    {p.pro_fixo ? (
                      <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-2.5 text-xs text-teal-950 space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="flex items-center gap-1.5 text-teal-800">
                            <UserCheck className="w-4 h-4 text-teal-600" />
                            Profissional Fixa Designada
                          </span>
                          <Badge className="bg-teal-600 text-white text-[10px] uppercase">
                            {p.tipo_remuneracao_fixa === 'por_hora' ? 'Por Hora' : 'Mensalista'}
                          </Badge>
                        </div>
                        <div className="font-bold text-slate-900">
                          {p.expand?.pro_fixo?.name ||
                            p.expand?.pro_fixo?.email ||
                            'Profissional vinculada'}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {p.tipo_remuneracao_fixa === 'por_hora' ? (
                            <span>
                              Remuneração:{' '}
                              <strong>
                                {formatCurrencyBRL(p.valor_remuneracao_fixa || 0)}/hora
                              </strong>{' '}
                              (
                              {formatCurrencyBRL(
                                (p.valor_remuneracao_fixa || 0) * (p.carga_horaria || 8),
                              )}
                              /turno de {p.carga_horaria}h)
                            </span>
                          ) : (
                            <span>
                              Salário Mensal:{' '}
                              <strong>
                                {formatCurrencyBRL(p.valor_remuneracao_fixa || 0)}/mês
                              </strong>{' '}
                              (fora de diárias)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                          Sem profissional fixa (convocações freelancers)
                        </span>
                        <Badge variant="outline" className="text-[10px] text-slate-500">
                          Motor 3 Camadas
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Vigência: {formatDateBR(p.vigencia_inicio)} até {formatDateBR(p.vigencia_fim)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(p)}
                      className="text-teal-700 hover:text-teal-800 hover:bg-teal-50 h-8 px-2 text-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" />
                      Editar
                    </Button>
                  </div>{' '}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Criar / Editar Posto */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>
                {editingPosto ? 'Editar Posto de Trabalho' : 'Cadastrar Novo Posto'}
              </DialogTitle>
              <DialogDescription>
                Informe os dados do posto, endereço e requisitos operacionais para alocação de
                profissionais.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Nome do Posto *
                  </label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Portaria Torre Alfa"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Função *
                  </label>
                  <Select value={funcao} onValueChange={(v) => setFuncao(v as PostoFuncao)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porteiro">Porteiro</SelectItem>
                      <SelectItem value="limpeza">Limpeza</SelectItem>
                      <SelectItem value="zeladoria">Zeladoria</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Carga Horária (horas) *
                  </label>
                  <Input
                    type="number"
                    value={cargaHoraria}
                    onChange={(e) => setCargaHoraria(Number(e.target.value))}
                    min={1}
                    max={24}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Status *
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Início da Vigência
                  </label>
                  <Input
                    type="date"
                    value={vigenciaInicio}
                    onChange={(e) => setVigenciaInicio(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Fim da Vigência
                </label>
                <Input
                  type="date"
                  value={vigenciaFim}
                  onChange={(e) => setVigenciaFim(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Endereço da Unidade
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      Logradouro
                    </label>
                    <Input
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      placeholder="Av. Paulista"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Número</label>
                    <Input
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="1000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Bairro</label>
                    <Input
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Bela Vista"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      Cidade * (match de feriados)
                    </label>
                    <Input
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder="São Paulo"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">UF</label>
                    <Input
                      value={uf}
                      onChange={(e) => setUf(e.target.value)}
                      placeholder="SP"
                      maxLength={2}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-600 block mb-1">CEP</label>
                  <Input
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    placeholder="01310-100"
                  />
                </div>
              </div>

              {/* Configuração de Profissional Fixa por Posto */}
              <div className="pt-3 border-t border-slate-200 space-y-3 bg-slate-50/70 p-3.5 rounded-lg border">
                <div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-teal-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Profissional Fixa do Posto
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Se este posto possui profissional fixa contratada, ela terá prioridade absoluta
                    na convocação direta e sua remuneração segue o modelo contratado (fora do motor
                    de diária).
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <Input
                        value={buscaPro}
                        onChange={(e) => setBuscaPro(e.target.value)}
                        placeholder="Buscar profissional por nome ou e-mail..."
                        className="pl-8 text-xs h-8"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Selecione a Profissional Fixa
                    </label>
                    <Select value={proFixoId} onValueChange={setProFixoId}>
                      <SelectTrigger className="text-xs bg-white">
                        <SelectValue placeholder="Selecione um profissional..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        <SelectItem value="nenhum">
                          Nenhum (usar somente freelancers com motor)
                        </SelectItem>
                        {pros
                          .filter((p) => {
                            if (!buscaPro.trim()) return true
                            const query = buscaPro.toLowerCase()
                            return (
                              (p.name && p.name.toLowerCase().includes(query)) ||
                              (p.email && p.email.toLowerCase().includes(query))
                            )
                          })
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name || p.email} ({p.status})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {proFixoId && proFixoId !== 'nenhum' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Tipo de Remuneração da Fixa *
                      </label>
                      <Select
                        value={tipoRemuneracaoFixa}
                        onValueChange={(v) => {
                          const val = v as TipoRemuneracaoFixa
                          setTipoRemuneracaoFixa(val)
                          if (val === 'mensal' && valorRemuneracaoFixa < 100) {
                            setValorRemuneracaoFixa(2200)
                          } else if (val === 'por_hora' && valorRemuneracaoFixa > 200) {
                            setValorRemuneracaoFixa(25)
                          }
                        }}
                      >
                        <SelectTrigger className="text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensal">Mensal (Salário Contratado Fixo)</SelectItem>
                          <SelectItem value="por_hora">Por Hora Trabalhada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        {tipoRemuneracaoFixa === 'mensal'
                          ? 'Valor Mensal Contratado (R$) *'
                          : 'Valor da Hora (R$/h) *'}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorRemuneracaoFixa}
                        onChange={(e) => setValorRemuneracaoFixa(Number(e.target.value))}
                        className="bg-white text-xs"
                        required={proFixoId !== 'nenhum'}
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        {tipoRemuneracaoFixa === 'mensal'
                          ? 'Não gera cobrança de diária no escrow por escala.'
                          : `Total por turno (${cargaHoraria}h): ${formatCurrencyBRL(
                              Number(valorRemuneracaoFixa) * Number(cargaHoraria),
                            )}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Requisitos Operacionais
                </label>
                <Textarea
                  value={requisitos}
                  onChange={(e) => setRequisitos(e.target.value)}
                  placeholder="Habilidades exigidas, uniforme, sistemas a operar..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white"
                disabled={isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar Posto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
