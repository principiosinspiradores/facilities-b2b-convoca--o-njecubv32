import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useRealtime } from '@/hooks/use-realtime'
import { MensagemConversaRecord, MensagemRecord, UserRecord } from '@/types/facilities'
import {
  listarConversas,
  listarMensagens,
  enviarMensagem,
  marcarConversaComoLida,
  obterOuCriarConversaContextual,
  obterOuCriarConversaDireta,
} from '@/services/mensagens'
import pb from '@/lib/pocketbase/client'
import { formatDateTimeBR, formatDateBR } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import {
  Send,
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  Calendar,
  Building2,
  Clock,
  User,
  Check,
  CheckCheck,
  Inbox,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'

export default function MensagensPage() {
  const { user, role } = useAuth()
  const { settings } = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Parâmetros de contexto vindos pela URL: ex ?conversa=xxx ou ?convocacao=yyy&pro=zzz
  const paramConversaId = searchParams.get('conversa')
  const paramConvocacaoId = searchParams.get('convocacao')
  const paramEscalaId = searchParams.get('escala')
  const paramProId = searchParams.get('pro')

  const [conversas, setConversas] = useState<MensagemConversaRecord[]>([])
  const [selectedConversa, setSelectedConversa] = useState<MensagemConversaRecord | null>(null)
  const [mensagens, setMensagens] = useState<MensagemRecord[]>([])
  const [isLoadingConversas, setIsLoadingConversas] = useState(true)
  const [isLoadingMensagens, setIsLoadingMensagens] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [textoInput, setTextoInput] = useState('')
  const [busca, setBusca] = useState('')

  // Modal para iniciar conversa direta com profissional (para empresa/admin)
  const [modalNovaConversa, setModalNovaConversa] = useState(false)
  const [prosDisponiveis, setProsDisponiveis] = useState<UserRecord[]>([])
  const [selectedProParaIniciar, setSelectedProParaIniciar] = useState('')
  const [iniciandoConversa, setIniciandoConversa] = useState(false)

  // Rolagem automática para a última mensagem
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  const corPrimaria = settings?.cor_primaria || '#0F766E'

  // Carrega todas as conversas do usuário
  const carregarConversas = useCallback(
    async (selecionarIdAposCarregar?: string) => {
      if (!user) return
      try {
        const records = await listarConversas(user.id, role || 'pro')
        setConversas(records)

        // Se foi solicitado selecionar uma conversa específica
        if (selecionarIdAposCarregar) {
          const alvo = records.find((c) => c.id === selecionarIdAposCarregar)
          if (alvo) {
            setSelectedConversa(alvo)
          }
        } else if (!selectedConversa && records.length > 0 && window.innerWidth >= 1024) {
          // No desktop, seleciona a primeira automaticamente se nenhuma estiver ativa
          setSelectedConversa(records[0])
        }
      } catch (err) {
        console.error('Erro ao carregar conversas:', err)
        toast({
          title: 'Erro ao carregar mensagens',
          description: 'Não foi possível buscar a lista de conversas.',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingConversas(false)
      }
    },
    [user, role, selectedConversa],
  )

  // Tratamento de parâmetros de URL para abrir ou criar conversa contextual/direta
  useEffect(() => {
    async function inicializarPorParams() {
      if (!user) return

      // Caso 1: Parâmetro de conversa direta específico
      if (paramConversaId) {
        try {
          const c = await pb
            .collection('mensagens_conversas')
            .getOne<MensagemConversaRecord>(paramConversaId, {
              expand:
                'pro,participantes,escala,escala.posto,convocacao,convocacao.escala,convocacao.escala.posto',
            })
          setSelectedConversa(c)
          carregarConversas(c.id)
          return
        } catch {
          // Se falhou carregar conversa específica, cai no fluxo geral
        }
      }

      // Caso 2: Parâmetro de convocação / escala vindo do card
      if ((paramConvocacaoId || paramEscalaId) && user) {
        try {
          const proIdAlvo = paramProId || user.id
          let titulo = 'Turno / Convocação'

          if (paramConvocacaoId) {
            try {
              const conv = await pb.collection('convocacoes').getOne(paramConvocacaoId, {
                expand: 'escala,escala.posto',
              })
              const escalaObj = (conv as any).expand?.escala
              const postoObj = escalaObj?.expand?.posto
              titulo = `${postoObj?.nome || 'Posto'} • ${formatDateBR(escalaObj?.data)}`
            } catch {
              /* intentionally ignored */
            }
          } else if (paramEscalaId) {
            try {
              const esc = await pb.collection('escalas').getOne(paramEscalaId, {
                expand: 'posto',
              })
              const postoObj = (esc as any).expand?.posto
              titulo = `${postoObj?.nome || 'Posto'} • ${formatDateBR((esc as any).data)}`
            } catch {
              /* intentionally ignored */
            }
          }

          const convObj = await obterOuCriarConversaContextual({
            proId: proIdAlvo,
            convocacaoId: paramConvocacaoId || undefined,
            escalaId: paramEscalaId || undefined,
            tituloContexto: titulo,
            criadorId: user.id,
          })

          setSelectedConversa(convObj)
          setSearchParams({ conversa: convObj.id })
          carregarConversas(convObj.id)
          return
        } catch (err) {
          console.error('Erro ao resolver conversa contextual:', err)
        }
      }

      // Fluxo padrão
      carregarConversas()
    }

    inicializarPorParams()
  }, [user, paramConversaId, paramConvocacaoId, paramEscalaId, paramProId])

  // Inscrição em tempo real para conversas
  useRealtime<MensagemConversaRecord>(
    'mensagens_conversas',
    useCallback(
      (data) => {
        if (data.action === 'create' || data.action === 'update') {
          // Atualiza lista em segundo plano
          listarConversas(user?.id || '', role || 'pro').then((recs) => {
            setConversas(recs)
            // Se a conversa aberta recebeu update, sincroniza
            if (selectedConversa?.id === data.record.id) {
              const atual = recs.find((r) => r.id === data.record.id)
              if (atual) setSelectedConversa(atual)
            }
          })
        } else if (data.action === 'delete') {
          setConversas((prev) => prev.filter((c) => c.id !== data.record.id))
          if (selectedConversa?.id === data.record.id) {
            setSelectedConversa(null)
          }
        }
      },
      [user?.id, role, selectedConversa?.id],
    ),
  )

  // Carrega o histórico de mensagens da conversa selecionada
  const carregarMensagensDaConversa = useCallback(
    async (conversaId: string) => {
      setIsLoadingMensagens(true)
      try {
        const msgs = await listarMensagens(conversaId)
        setMensagens(msgs)
        setTimeout(() => scrollToBottom('auto'), 50)

        // Marca conversa como lida
        if (user) {
          marcarConversaComoLida(conversaId, role || 'pro', user.id)
        }
      } catch (err) {
        console.error('Erro ao carregar mensagens:', err)
        toast({
          title: 'Erro ao carregar histórico',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingMensagens(false)
      }
    },
    [user, role],
  )

  useEffect(() => {
    if (selectedConversa?.id) {
      carregarMensagensDaConversa(selectedConversa.id)
    } else {
      setMensagens([])
    }
  }, [selectedConversa?.id, carregarMensagensDaConversa])

  // Inscrição em tempo real para as mensagens da conversa selecionada
  useRealtime<MensagemRecord>(
    'mensagens_mensagens',
    useCallback(
      (data) => {
        if (!selectedConversa) return

        if (data.record.conversa === selectedConversa.id) {
          if (data.action === 'create') {
            setMensagens((prev) => {
              // Evita duplicar se já foi adicionada otimisticamente
              if (prev.some((m) => m.id === data.record.id)) return prev
              return [...prev, data.record]
            })
            setTimeout(() => scrollToBottom('smooth'), 50)

            // Se recebemos mensagem do outro lado enquanto a conversa está aberta, marcar como lida
            if (user && data.record.remetente !== user.id) {
              marcarConversaComoLida(selectedConversa.id, role || 'pro', user.id)
            }
          } else if (data.action === 'update') {
            setMensagens((prev) => prev.map((m) => (m.id === data.record.id ? data.record : m)))
          }
        }
      },
      [selectedConversa, user, role],
    ),
  )

  // Enviar mensagem
  const handleEnviar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!textoInput.trim() || !selectedConversa || !user) return

    const texto = textoInput.trim()
    setTextoInput('')
    setIsSending(true)

    try {
      const novaMsg = await enviarMensagem({
        conversaId: selectedConversa.id,
        remetenteId: user.id,
        remetenteRole: role || 'pro',
        texto,
      })

      // Adiciona otimisticamente caso o realtime demore alguns ms
      setMensagens((prev) => {
        if (prev.some((m) => m.id === novaMsg.id)) return prev
        return [...prev, { ...novaMsg, expand: { remetente: user as any } }]
      })
      setTimeout(() => scrollToBottom('smooth'), 50)
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      toast({
        title: 'Falha no envio',
        description: 'Não foi possível entregar a mensagem. Tente novamente.',
        variant: 'destructive',
      })
      // Restaura texto em caso de erro
      setTextoInput(texto)
    } finally {
      setIsSending(false)
    }
  }

  // Abre modal de nova conversa direta
  const handleAbrirNovaConversa = async () => {
    try {
      const pros = await pb.collection('users').getFullList<UserRecord>({
        filter: 'role = "pro" && status != "bloqueado"',
        sort: 'name',
      })
      setProsDisponiveis(pros)
      if (pros.length > 0) {
        setSelectedProParaIniciar(pros[0].id)
      }
      setModalNovaConversa(true)
    } catch (err) {
      console.error('Erro ao buscar lista de profissionais:', err)
    }
  }

  // Cria conversa direta com o profissional selecionado
  const handleConfirmarNovaConversa = async () => {
    if (!selectedProParaIniciar || !user) return
    setIniciandoConversa(true)
    try {
      const proObj = prosDisponiveis.find((p) => p.id === selectedProParaIniciar)
      const nova = await obterOuCriarConversaDireta(selectedProParaIniciar, user.id, proObj?.name)
      setModalNovaConversa(false)
      setSelectedConversa(nova)
      setSearchParams({ conversa: nova.id })
      carregarConversas(nova.id)
    } catch (err) {
      console.error('Erro ao iniciar conversa:', err)
      toast({
        title: 'Erro ao abrir canal de conversa',
        variant: 'destructive',
      })
    } finally {
      setIniciandoConversa(false)
    }
  }

  // Filtro de conversas
  const conversasFiltradas = conversas.filter((c) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    const nomePro = c.expand?.pro?.name?.toLowerCase() || ''
    const contexto = c.titulo_contexto?.toLowerCase() || ''
    const ultMsg = c.ultima_mensagem_texto?.toLowerCase() || ''
    return nomePro.includes(termo) || contexto.includes(termo) || ultMsg.includes(termo)
  })

  // Helper para identificar se uma conversa tem mensagens não lidas
  const temNaoLida = (c: MensagemConversaRecord) => {
    if (!c.ultima_mensagem_data) return false
    const ultData = new Date(c.ultima_mensagem_data).getTime()
    if (role === 'pro') {
      const lidaPro = c.leitura_pro_em ? new Date(c.leitura_pro_em).getTime() : 0
      return ultData > lidaPro
    } else {
      const lidaEmp = c.leitura_empresa_em ? new Date(c.leitura_empresa_em).getTime() : 0
      return ultData > lidaEmp
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho de contexto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-teal-700" />
            Central de Mensagens Internas
            <Badge
              variant="outline"
              className="bg-teal-50 text-teal-800 border-teal-200 text-[11px] font-semibold uppercase tracking-wider"
            >
              Tempo Real
            </Badge>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Comunicação direta e contextual entre profissionais e a operação de facilities. Sem
            mensagens externas.
          </p>
        </div>

        {role !== 'pro' && (
          <Button
            onClick={handleAbrirNovaConversa}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-xs h-9 font-semibold shadow-xs hover:opacity-90 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Conversa com Pro
          </Button>
        )}
      </div>

      {/* Grid Principal do Chat: Lista de Conversas (Esquerda) e Painel de Chat (Direita) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-[74vh] min-h-[500px] flex">
        {/* COLUNA ESQUERDA: LISTA DE CONVERSAS */}
        <div
          className={`w-full lg:w-80 lg:shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/60 ${
            selectedConversa ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Campo de Busca */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar conversa ou pro..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white"
              />
            </div>
          </div>

          {/* Lista com Scroll */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingConversas ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Carregando conversas...
              </div>
            ) : conversasFiltradas.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">Nenhuma conversa encontrada</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {role === 'pro'
                    ? 'Suas conversas de escalas e contatos com a empresa aparecerão aqui.'
                    : 'Inicie uma conversa direta ou aguarde mensagens contextuais dos turnos.'}
                </p>
              </div>
            ) : (
              conversasFiltradas.map((conv) => {
                const isSelected = selectedConversa?.id === conv.id
                const naoLida = temNaoLida(conv)
                const nomeExibicao =
                  role === 'pro' ? 'Equipe de Facilities' : conv.expand?.pro?.name || 'Profissional'

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversa(conv)
                      setSearchParams({ conversa: conv.id })
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 relative ${
                      isSelected
                        ? 'bg-teal-50/80 border-r-4 border-teal-700'
                        : 'hover:bg-slate-100/70 bg-white'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        backgroundColor: isSelected ? corPrimaria : '#0f766e',
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs mt-0.5"
                    >
                      {role === 'pro' ? (
                        <Building2 className="w-5 h-5 text-white" />
                      ) : (
                        nomeExibicao.slice(0, 2).toUpperCase()
                      )}
                    </div>

                    {/* Conteúdo textual da conversa */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={`text-xs truncate ${
                            naoLida ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                          }`}
                        >
                          {nomeExibicao}
                        </span>
                        {conv.ultima_mensagem_data && (
                          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                            {formatDateTimeBR(conv.ultima_mensagem_data).split(' ')[1] || ''}
                          </span>
                        )}
                      </div>

                      {/* Título de contexto (se for de turno ou direta) */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 uppercase tracking-tight font-medium ${
                            conv.tipo === 'contextual'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {conv.tipo === 'contextual' ? 'Turno' : 'Direta'}
                        </Badge>
                        <span
                          className="text-[11px] text-slate-500 truncate"
                          title={conv.titulo_contexto}
                        >
                          {conv.titulo_contexto || 'Atendimento'}
                        </span>
                      </div>

                      {/* Prévia da última mensagem */}
                      <p
                        className={`text-xs truncate ${
                          naoLida ? 'font-semibold text-slate-800' : 'text-slate-500'
                        }`}
                      >
                        {conv.ultima_mensagem_texto || 'Sem mensagens recentes'}
                      </p>
                    </div>

                    {/* Badge indicador de não lida */}
                    {naoLida && (
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-600 shrink-0 self-center"></span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO E ENVIO DE MENSAGENS */}
        <div
          className={`flex-1 flex flex-col bg-slate-50/30 ${
            !selectedConversa ? 'hidden lg:flex items-center justify-center' : 'flex'
          }`}
        >
          {selectedConversa ? (
            <>
              {/* Header do Chat Ativo */}
              <div className="p-3.5 sm:p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Botão voltar no mobile */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedConversa(null)}
                    className="lg:hidden text-slate-600 -ml-1.5 shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>

                  <div
                    style={{ backgroundColor: corPrimaria }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs"
                  >
                    {role === 'pro' ? (
                      <Building2 className="w-4 h-4 text-white" />
                    ) : (
                      (selectedConversa.expand?.pro?.name || 'Pro').slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                      <span>
                        {role === 'pro'
                          ? 'Equipe de Facilities (Operação & RH)'
                          : selectedConversa.expand?.pro?.name || 'Profissional'}
                      </span>
                      {selectedConversa.tipo === 'contextual' ? (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] uppercase font-semibold">
                          Contexto de Escala
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] uppercase font-semibold">
                          Canal Direto
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                      <span>{selectedConversa.titulo_contexto || 'Atendimento Operacional'}</span>
                      {role === 'admin' && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          Visualização Admin (Mediação)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Área das Mensagens com Scroll */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {isLoadingMensagens ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Carregando histórico...
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 max-w-sm mx-auto">
                    <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">Início da Conversa</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Envie uma mensagem abaixo para falar sobre o turno, horários ou orientações.
                    </p>
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const isMinha = msg.remetente === user?.id
                    const remetenteNome =
                      msg.expand?.remetente?.name ||
                      (isMinha ? 'Você' : role === 'pro' ? 'Facilities' : 'Pro')

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMinha ? 'items-end' : 'items-start'}`}
                      >
                        <div className="text-[10px] text-slate-400 px-1 mb-0.5 flex items-center gap-1">
                          <span>{remetenteNome}</span>
                          <span>&bull;</span>
                          <span>{formatDateTimeBR(msg.created)}</span>
                        </div>

                        <div
                          style={
                            isMinha ? { backgroundColor: corPrimaria, color: '#ffffff' } : undefined
                          }
                          className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm shadow-xs break-words whitespace-pre-wrap leading-relaxed ${
                            isMinha
                              ? 'rounded-tr-xs text-white'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                          }`}
                        >
                          {msg.texto}

                          <div
                            className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                              isMinha ? 'text-teal-100' : 'text-slate-400'
                            }`}
                          >
                            <span>{msg.created ? msg.created.slice(11, 16) : ''}</span>
                            {isMinha && (
                              <span>
                                {msg.lida ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-teal-200 inline" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 opacity-70 inline" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Caixa de Entrada e Envio */}
              <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
                <form onSubmit={handleEnviar} className="flex items-center gap-2">
                  <Input
                    placeholder="Digite sua mensagem interna... (Pressione Enter para enviar)"
                    value={textoInput}
                    onChange={(e) => setTextoInput(e.target.value)}
                    disabled={isSending}
                    className="flex-1 text-xs sm:text-sm h-10 bg-slate-50 border-slate-200 focus:bg-white"
                  />
                  <Button
                    type="submit"
                    disabled={isSending || !textoInput.trim()}
                    style={{ backgroundColor: corPrimaria }}
                    className="h-10 px-4 text-white font-medium shadow-xs hover:opacity-90"
                  >
                    {isSending ? (
                      <span className="animate-spin text-xs">⏳</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Enviar</span>
                      </>
                    )}
                  </Button>
                </form>
                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between px-1">
                  <span>Mensagem interna segura • Notificações disparadas com white label</span>
                  <span>Enter para enviar</span>
                </div>
              </div>
            </>
          ) : (
            /* Estado vazio quando nenhuma conversa foi selecionada */
            <div className="p-8 text-center text-slate-400 max-w-sm">
              <MessageSquare className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-700">Selecione uma conversa</h3>
              <p className="text-xs text-slate-400 mt-1.5">
                Escolha uma conversa na lista à esquerda ou inicie um novo canal de mensagens com os
                profissionais cadastrados.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Iniciar Nova Conversa Direta (Empresa / Admin) */}
      <Dialog open={modalNovaConversa} onOpenChange={setModalNovaConversa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar Nova Conversa Direta</DialogTitle>
            <DialogDescription>
              Selecione o profissional com quem deseja abrir um canal de atendimento direto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Profissional *
              </label>
              <Select value={selectedProParaIniciar} onValueChange={setSelectedProParaIniciar}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um profissional..." />
                </SelectTrigger>
                <SelectContent>
                  {prosDisponiveis.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-slate-500">
              A conversa ficará disponível para toda a equipe da empresa e para o profissional.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalNovaConversa(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={iniciandoConversa || !selectedProParaIniciar}
              style={{ backgroundColor: corPrimaria }}
              className="text-white"
              onClick={handleConfirmarNovaConversa}
            >
              {iniciandoConversa ? 'Abrindo canal...' : 'Abrir Conversa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
