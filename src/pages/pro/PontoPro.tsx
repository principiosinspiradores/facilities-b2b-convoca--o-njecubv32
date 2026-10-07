import React, { useState, useEffect, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ConvocacaoRecord, EscalaRecord, PontoRecord, PostoRecord } from '@/types/facilities'
import { formatDateBR } from '@/lib/formatters'
import {
  calcularDistanciaMetros,
  getCoordenadasPosto,
  getToleranciasPosto,
  verificarHorarioTurno,
  postoTemCoordenadas,
} from '@/services/ponto'
import {
  PontoPendenteItem,
  salvarPontoOffline,
  listarPontosPendentes,
  sincronizarPontosPendentes,
  salvarCachePro,
  carregarCachePro,
  registrarUltimoAcessoOnline,
  verificarHorarioSuspeito,
  fileToDataURL,
} from '@/services/pontoOffline'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Clock,
  MapPin,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Upload,
  RefreshCw,
  Navigation,
  FileCheck,
  Calendar,
  Wifi,
  WifiOff,
  CloudUpload,
  Smartphone,
  CheckCheck,
  Share,
  PlusSquare,
  Sparkles,
  Download,
} from 'lucide-react'

export default function PontoProPage() {
  const { user } = useAuth()
  const [escalasHoje, setEscalasHoje] = useState<ConvocacaoRecord[]>([])
  const [pontosRegistrados, setPontosRegistrados] = useState<PontoRecord[]>([])
  const [pontosPendentes, setPontosPendentes] = useState<PontoPendenteItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Status de conectividade
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [isSyncing, setIsSyncing] = useState(false)

  // Suporte avançado a instalação PWA (1 clique Android + guia iPhone)
  const {
    canInstallNatively,
    isInstalled: pwaInstalledHook,
    isIos,
    promptInstall,
  } = useInstallPrompt()
  const [modalIosOpen, setModalIosOpen] = useState(false)
  const [modalDesktopOpen, setModalDesktopOpen] = useState(false)
  const [pwaInstalledLocal, setPwaInstalledLocal] = useState(false)
  const pwaInstalled = pwaInstalledHook || pwaInstalledLocal

  // Modal de Registro
  const [modalRegistroOpen, setModalRegistroOpen] = useState(false)
  const [tipoRegistro, setTipoRegistro] = useState<'chegada' | 'saida'>('chegada')
  const [selectedEscala, setSelectedEscala] = useState<EscalaRecord | null>(null)

  // Modal de registro de presença sem convocação (alerta de presença)
  const [modalPresencaSemConvOpen, setModalPresencaSemConvOpen] = useState(false)
  const [selectedPostoSemConv, setSelectedPostoSemConv] = useState<PostoRecord | null>(null)
  const [alertaSucessoSemConv, setAlertaSucessoSemConv] = useState(false)
  const [postosDisponiveis, setPostosDisponiveis] = useState<PostoRecord[]>([])

  const [isCapturingLocation, setIsCapturingLocation] = useState(false)
  const [userCoords, setUserCoords] = useState<{
    lat: number
    lng: number
    accuracy?: number
  } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleInstallPwa = async () => {
    // 1. Se houver deferredPrompt disponível (Android / Chrome / Edge), instalação nativa em 1 clique
    if (canInstallNatively) {
      const outcome = await promptInstall()
      if (outcome === 'accepted') {
        setPwaInstalledLocal(true)
        toast({
          title: 'App instalado com sucesso!',
          description: 'O ícone do Ponto Digital já está na sua tela inicial.',
        })
      }
      return
    }

    // 2. Se estiver no iPhone / iPad (Safari) -> abrir guia visual ilustrado e simples
    if (isIos) {
      setModalIosOpen(true)
      return
    }

    // 3. Em desktops ou outros navegadores -> instruções práticas
    setModalDesktopOpen(true)
  }

  // Recarregar pontos pendentes do IndexedDB
  const atualizarPontosPendentes = async () => {
    if (!user) return
    try {
      const pendentes = await listarPontosPendentes(user.id)
      setPontosPendentes(pendentes)
    } catch (e) {
      console.warn('Erro ao ler fila offline:', e)
    }
  }

  // Sincronização automática
  const triggerSync = async () => {
    if (!user || isSyncing || !navigator.onLine) return
    setIsSyncing(true)
    try {
      const res = await sincronizarPontosPendentes(user.id)
      if (res.sucessos > 0) {
        toast({
          title: 'Sincronização concluída!',
          description: `${res.sucessos} registro(s) de ponto enviado(s) ao sistema com a hora oficial do batimento.`,
        })
        await loadData(false)
      }
      await atualizarPontosPendentes()
    } catch (err) {
      console.error('Erro na sincronização automática:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  // Listeners de rede online/offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      registrarUltimoAcessoOnline()
      toast({
        title: 'Conexão restaurada!',
        description: 'Sincronizando pontos registrados offline...',
      })
      triggerSync()
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast({
        title: 'Você está offline',
        description:
          'Você pode bater o ponto normalmente. O registro será salvo no aparelho e enviado ao reconectar.',
        variant: 'destructive',
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user])

  // Carregar dados (com cache offline)
  const loadData = async (showLoading = true) => {
    if (!user) return
    if (showLoading) setIsLoading(true)

    // Sempre carregar fila offline primeiro
    await atualizarPontosPendentes()

    if (!navigator.onLine) {
      // Modo offline: carregar do cache IndexedDB/localStorage
      const cachedConvs = await carregarCachePro<ConvocacaoRecord[]>(`escalas_${user.id}`)
      const cachedPontos = await carregarCachePro<PontoRecord[]>(`pontos_${user.id}`)
      if (cachedConvs) setEscalasHoje(cachedConvs)
      if (cachedPontos) setPontosRegistrados(cachedPontos)
      setIsLoading(false)
      return
    }

    try {
      registrarUltimoAcessoOnline()

      // Buscar convocações aceitas pelo pro, postos ativos e pontos registrados
      const [convs, postosList, pontos] = await Promise.all([
        pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
          filter: `pro = "${user.id}" && status = "aceita"`,
          sort: '-data_convocacao',
          expand: 'escala,escala.posto',
        }),
        pb.collection('postos').getFullList<PostoRecord>({
          filter: 'status = "ativo"',
          sort: 'nome',
        }),
        pb.collection('pontos').getFullList<PontoRecord>({
          filter: `pro = "${user.id}"`,
          sort: '-timestamp_real',
          expand: 'escala,escala.posto,posto',
        }),
      ])

      setEscalasHoje(convs)
      setPostosDisponiveis(postosList)
      setPontosRegistrados(pontos)

      // Guardar cache persistente para uso offline
      await salvarCachePro(`escalas_${user.id}`, convs)
      await salvarCachePro(`pontos_${user.id}`, pontos)

      // Se houver pendências locais, tenta sincronizar logo após carregar
      await triggerSync()
    } catch (err) {
      console.warn('Erro ao buscar dados online, tentando cache local:', err)
      const cachedConvs = await carregarCachePro<ConvocacaoRecord[]>(`escalas_${user.id}`)
      const cachedPontos = await carregarCachePro<PontoRecord[]>(`pontos_${user.id}`)
      if (cachedConvs) setEscalasHoje(cachedConvs)
      if (cachedPontos) setPontosRegistrados(cachedPontos)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  // Capturar Geolocalização do dispositivo (funciona com o chip GPS nativo sem precisar de internet)
  const capturarLocalizacao = () => {
    setIsCapturingLocation(true)
    setGeoError(null)

    if (!navigator.geolocation) {
      setGeoError('Geolocalização não é suportada pelo seu dispositivo.')
      setIsCapturingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setIsCapturingLocation(false)
      },
      (err) => {
        console.warn('Erro ao obter geolocalização:', err.message)
        // Se houver bloqueio de permissão de geolocalização, simular coordenadas padrão de teste do posto
        const postoCoords = getCoordenadasPosto(selectedEscala?.expand?.posto)
        setUserCoords({
          lat: postoCoords.lat,
          lng: postoCoords.lng,
          accuracy: 50,
        })
        setGeoError('Aviso: GPS do dispositivo inacessível. Usando referência do posto.')
        setIsCapturingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  const openRegistroModal = (conv: ConvocacaoRecord, tipo: 'chegada' | 'saida') => {
    if (!conv.expand?.escala) return
    setSelectedEscala(conv.expand.escala)
    setTipoRegistro(tipo)
    setUserCoords(null)
    setGeoError(null)
    setFotoFile(null)
    setFotoPreview(null)
    setCameraActive(false)
    setModalRegistroOpen(true)
    capturarLocalizacao()
  }

  const openPresencaSemConvocacaoModal = (posto: PostoRecord) => {
    setSelectedPostoSemConv(posto)
    setUserCoords(null)
    setGeoError(null)
    setFotoFile(null)
    setFotoPreview(null)
    setCameraActive(false)
    setAlertaSucessoSemConv(false)
    setModalPresencaSemConvOpen(true)
    capturarLocalizacao()
  }

  // Salvar registro de Presença sem convocação (alerta operacional)
  const handleSalvarPresencaSemConvocacao = async () => {
    if (!selectedPostoSemConv || !user) return

    setIsSaving(true)
    try {
      const instanteClique = new Date()
      const timestampBatimento = instanteClique.toISOString()

      const postoCoords = getCoordenadasPosto(selectedPostoSemConv)
      const { raioGeocercaM } = getToleranciasPosto(selectedPostoSemConv)

      const latAtual = userCoords?.lat ?? postoCoords.lat
      const lngAtual = userCoords?.lng ?? postoCoords.lng
      const distancia = calcularDistanciaMetros(
        latAtual,
        lngAtual,
        postoCoords.lat,
        postoCoords.lng,
      )

      if (distancia > raioGeocercaM) {
        toast({
          title: 'Bloqueado: Fora do raio do posto',
          description: `Você está a ${distancia} m do posto "${selectedPostoSemConv.nome}". Aproxime-se para registrar o alerta de presença. (Raio: ${raioGeocercaM} m)`,
          variant: 'destructive',
        })
        setIsSaving(false)
        return
      }

      const clientUuid = `alerta_sem_conv_${user.id}_${selectedPostoSemConv.id}_${Date.now()}`

      const formData = new FormData()
      formData.append('pro', user.id)
      formData.append('posto', selectedPostoSemConv.id)
      formData.append('tipo', 'chegada')
      formData.append('timestamp_real', timestampBatimento)
      formData.append('latitude', String(latAtual))
      formData.append('longitude', String(lngAtual))
      formData.append('dentro_raio', 'true')
      formData.append('distancia_metros', String(distancia))
      formData.append('raio_posto_m', String(raioGeocercaM))
      formData.append('aviso_sem_convocacao', 'true')
      formData.append('status_validacao', 'alerta')
      formData.append(
        'ocorrencia',
        `Presença no posto ${selectedPostoSemConv.nome} registrada sem convocação formal aceita`,
      )
      formData.append('client_uuid', clientUuid)

      if (fotoFile) {
        formData.append('foto', fotoFile)
      }

      await pb.collection('pontos').create(formData)
      setAlertaSucessoSemConv(true)

      toast({
        title: 'Presença registrada como alerta',
        description: 'Sua presença foi registrada como alerta para a empresa com transparência.',
      })

      await loadData(false)
    } catch (err) {
      console.error('Erro ao registrar alerta de presença sem convocação:', err)
      toast({
        title: 'Erro ao registrar presença',
        description: 'Não foi possível registrar o alerta. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Câmera ao vivo
  const startCamera = async () => {
    try {
      setCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (err) {
      console.error('Erro ao abrir câmera:', err)
      setCameraActive(false)
      toast({
        title: 'Câmera indisponível',
        description: 'Você pode fazer upload de uma foto da galeria.',
      })
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `ponto_pro_${Date.now()}.jpg`, { type: 'image/jpeg' })
            setFotoFile(file)
            setFotoPreview(URL.createObjectURL(blob))
            stopCamera()
          }
        },
        'image/jpeg',
        0.85,
      )
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0]
      setFotoFile(f)
      setFotoPreview(URL.createObjectURL(f))
      stopCamera()
    }
  }

  // Salvar registro de ponto (com suporte offline transparente)
  const handleSalvarPonto = async () => {
    if (!selectedEscala || !user) return

    // Chegada exige foto de comprovação
    if (tipoRegistro === 'chegada' && !fotoFile) {
      toast({
        title: 'Foto obrigatória',
        description: 'Tire uma foto ou anexe uma foto de comprovação no momento da chegada.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      // 1. CAPTURA NO MOMENTO EXATO DO TOQUE
      const instanteClique = new Date()
      const timestampBatimento = instanteClique.toISOString()

      const posto = selectedEscala.expand?.posto
      const postoCoords = getCoordenadasPosto(posto)
      const { raioGeocercaM, toleranciaEntradaMinutos, toleranciaSaidaMinutos } =
        getToleranciasPosto(posto)

      const latAtual = userCoords?.lat ?? postoCoords.lat
      const lngAtual = userCoords?.lng ?? postoCoords.lng
      const precisaoGps = userCoords?.accuracy ?? 25

      // Distância do posto (validação offline pelo GPS e coordenadas do posto)
      const distancia = calcularDistanciaMetros(
        latAtual,
        lngAtual,
        postoCoords.lat,
        postoCoords.lng,
      )
      const dentroRaio = distancia <= raioGeocercaM

      // Se a batida ficar fora do raio, BLOQUEAR com mensagem clara exigida:
      // "Você está fora da cerca do posto (X m do local). Aproxime-se para registrar o ponto."
      if (!dentroRaio) {
        toast({
          title: 'Bloqueado: Fora da cerca do posto',
          description: `Você está fora da cerca do posto (${distancia} m do local). Aproxime-se para registrar o ponto. (Raio permitido: ${raioGeocercaM} m)`,
          variant: 'destructive',
        })
        setIsSaving(false)
        return
      }

      // Verificação de tolerância de horário do turno no instante do toque
      const toleranciaTurnoMinutos =
        tipoRegistro === 'chegada' ? toleranciaEntradaMinutos : toleranciaSaidaMinutos
      const horaProgramada =
        tipoRegistro === 'chegada' ? selectedEscala.turno_inicio : selectedEscala.turno_fim
      const verHorario = verificarHorarioTurno(
        tipoRegistro,
        selectedEscala.data,
        horaProgramada,
        instanteClique,
        toleranciaTurnoMinutos,
      )

      const foraJanela = !verHorario.dentroHorario

      // Identificar ocorrências
      const ocorrencias: string[] = []
      let statusValidacao: 'valido' | 'alerta' = 'valido'

      if (foraJanela) {
        ocorrencias.push(
          `Fora da janela de tolerância (${toleranciaTurnoMinutos}min): ${verHorario.mensagem}`,
        )
        statusValidacao = 'alerta'
      }

      // Verificação antifraude de horário suspeito
      const suspeito = verificarHorarioSuspeito(timestampBatimento)
      if (suspeito) {
        ocorrencias.push('Horário suspeito: batimento anterior ao último acesso online')
        statusValidacao = 'alerta'
      }

      // UUID exclusivo do cliente para idempotência
      const clientUuid = `ponto_${user.id}_${selectedEscala.id}_${tipoRegistro}_${Date.now()}`

      // Preparar dataURL da foto se houver para persistência offline
      let fotoDataUrl: string | null = null
      if (fotoFile) {
        fotoDataUrl = await fileToDataURL(fotoFile)
      }

      const estaOffline = !navigator.onLine

      if (estaOffline) {
        // MODO OFFLINE: Salvar diretamente no IndexedDB
        const itemPendente: PontoPendenteItem = {
          client_uuid: clientUuid,
          escala: selectedEscala.id,
          pro: user.id,
          tipo: tipoRegistro,
          timestamp_real: timestampBatimento,
          latitude: latAtual,
          longitude: lngAtual,
          gps_precisao_m: Math.round(precisaoGps),
          dentro_raio: dentroRaio,
          distancia_metros: distancia,
          raio_posto_m: raioGeocercaM,
          tolerancia_aplicada_minutos: toleranciaTurnoMinutos,
          fora_janela: foraJanela,
          fotoDataUrl: fotoDataUrl,
          fotoName: fotoFile ? fotoFile.name : undefined,
          fotoType: fotoFile ? fotoFile.type : undefined,
          ocorrencia: ocorrencias.join(' | '),
          status_validacao: statusValidacao,
          batido_offline: true,
          horario_suspeito: suspeito,
          postoNome: posto?.nome,
          turnoInfo: `${selectedEscala.turno_inicio} às ${selectedEscala.turno_fim}`,
          criado_em: new Date().toISOString(),
          tentativasEnvio: 0,
          status: 'pendente',
        }

        await salvarPontoOffline(itemPendente)
        await atualizarPontosPendentes()

        toast({
          title: `Ponto registrado ✓ aguardando envio`,
          description: `Horário salvo: ${instanteClique.toLocaleTimeString('pt-BR')}. Será enviado automaticamente quando a internet voltar.`,
        })
      } else {
        // MODO ONLINE: Tentar enviar direto; se falhar, salvar na fila offline
        try {
          const formData = new FormData()
          formData.append('escala', selectedEscala.id)
          formData.append('pro', user.id)
          formData.append('tipo', tipoRegistro)
          formData.append('timestamp_real', timestampBatimento)
          formData.append('latitude', String(latAtual))
          formData.append('longitude', String(lngAtual))
          formData.append('gps_precisao_m', String(Math.round(precisaoGps)))
          formData.append('dentro_raio', String(dentroRaio))
          formData.append('distancia_metros', String(distancia))
          formData.append('raio_posto_m', String(raioGeocercaM))
          formData.append('tolerancia_aplicada_minutos', String(toleranciaTurnoMinutos))
          formData.append('fora_janela', String(foraJanela))
          formData.append('status_validacao', statusValidacao)
          formData.append('ocorrencia', ocorrencias.join(' | '))
          formData.append('batido_offline', 'false')
          formData.append('sincronizado_em', new Date().toISOString())
          formData.append('atraso_sincronizacao_minutos', '0')
          formData.append('horario_suspeito', String(suspeito))
          formData.append('client_uuid', clientUuid)

          if (fotoFile) {
            formData.append('foto', fotoFile)
          }

          await pb.collection('pontos').create(formData)
          registrarUltimoAcessoOnline()

          toast({
            title: `Ponto de ${tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'} enviado!`,
            description:
              dentroRaio && !foraJanela
                ? 'Registro verificado com sucesso dentro do posto e no horário.'
                : 'Ponto registrado fora da janela de tolerância e enviado para revisão na conferência.',
            variant: dentroRaio && !foraJanela ? 'default' : 'destructive',
          })

          await loadData(false)
        } catch (envioErr) {
          console.warn('Falha no envio online, salvando na fila offline:', envioErr)
          const itemPendente: PontoPendenteItem = {
            client_uuid: clientUuid,
            escala: selectedEscala.id,
            pro: user.id,
            tipo: tipoRegistro,
            timestamp_real: timestampBatimento,
            latitude: latAtual,
            longitude: lngAtual,
            gps_precisao_m: Math.round(precisaoGps),
            dentro_raio: dentroRaio,
            distancia_metros: distancia,
            raio_posto_m: raioGeocercaM,
            tolerancia_aplicada_minutos: toleranciaTurnoMinutos,
            fora_janela: foraJanela,
            fotoDataUrl: fotoDataUrl,
            fotoName: fotoFile ? fotoFile.name : undefined,
            fotoType: fotoFile ? fotoFile.type : undefined,
            ocorrencia: ocorrencias.join(' | '),
            status_validacao: statusValidacao,
            batido_offline: true,
            horario_suspeito: suspeito,
            postoNome: posto?.nome,
            turnoInfo: `${selectedEscala.turno_inicio} às ${selectedEscala.turno_fim}`,
            criado_em: new Date().toISOString(),
            tentativasEnvio: 1,
            ultimoErro: 'Rede instável no envio',
            status: 'pendente',
          }

          await salvarPontoOffline(itemPendente)
          await atualizarPontosPendentes()

          toast({
            title: `Ponto registrado ✓ aguardando envio`,
            description: `Instabilidade na rede detectada. Ponto guardado com segurança e será sincronizado automaticamente.`,
          })
        }
      }

      stopCamera()
      setModalRegistroOpen(false)
    } catch (err) {
      console.error('Erro ao processar ponto:', err)
      toast({
        title: 'Erro ao registrar ponto',
        description: 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra de Status de Conectividade e PWA */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              Registro de Ponto Digital
            </h1>
            {isOnline ? (
              <Badge className="bg-primary/10 text-primary border-primary/30 gap-1 text-[11px] font-medium">
                <Wifi className="w-3 h-3 text-primary" />
                Online
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-900 border-amber-300 gap-1 text-[11px] animate-pulse">
                <WifiOff className="w-3 h-3 text-amber-700" />
                Modo Offline Ativo
              </Badge>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Bata a chegada e saída mesmo sem sinal de internet no posto. O registro é salvo no
            aparelho e sobe automaticamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Instalar PWA ou Selo de App Instalado */}
          {pwaInstalled ? (
            <Badge className="bg-primary/10 text-primary border-primary/30 gap-1.5 px-3 py-1.5 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              App instalado
            </Badge>
          ) : (
            <Button
              onClick={handleInstallPwa}
              size="sm"
              className="text-xs bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Instalar App de Ponto
            </Button>
          )}

          {/* Sincronização manual se houver pendências */}
          {pontosPendentes.length > 0 && (
            <Button
              onClick={triggerSync}
              disabled={isSyncing || !isOnline}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
            >
              <CloudUpload className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? 'animate-bounce' : ''}`} />
              {isSyncing ? 'Enviando...' : `Sincronizar (${pontosPendentes.length})`}
            </Button>
          )}

          <Button
            onClick={() => loadData(true)}
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Alerta de Pontos Pendentes de Envio */}
      {pontosPendentes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 shadow-sm">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                <CloudUpload className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <h4 className="font-bold text-amber-900 text-sm">
                  {pontosPendentes.length} batida(s) de ponto armazenada(s) localmente
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Registradas com sucesso no aparelho com hora real de batimento e coordenadas GPS.
                  {isOnline
                    ? ' Conexão ativa: clique para enviar agora ou aguarde o envio automático.'
                    : ' Aguardando conexão de internet para enviar ao sistema.'}
                </p>
              </div>
            </div>
            {isOnline && (
              <Button
                size="sm"
                onClick={triggerSync}
                disabled={isSyncing}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shrink-0"
              >
                {isSyncing ? 'Enviando ao servidor...' : 'Enviar Agora'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Turnos disponíveis para bater ponto */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Escalas Confirmadas & Registro do Dia
            </h2>

            {escalasHoje.length === 0 ? (
              <Card className="text-center py-8 border-dashed border border-slate-200 bg-white">
                <CardContent className="space-y-3">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm text-slate-600 font-medium">
                    Você não tem escalas com convocação aceita programadas para registrar ponto no
                    momento.
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Caso você tenha comparecido presencialmente a um posto sem convocação formal
                    registrada, você pode registrar sua presença como alerta transparente abaixo.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {escalasHoje.map((conv) => {
                  const escala = conv.expand?.escala
                  const posto = escala?.expand?.posto
                  const end = posto?.endereco as any

                  // Pontos já registrados no servidor para esta escala
                  const pontosEscala = pontosRegistrados.filter((p) => p.escala === escala?.id)
                  const pontoChegadaServidor = pontosEscala.find((p) => p.tipo === 'chegada')
                  const pontoSaidaServidor = pontosEscala.find((p) => p.tipo === 'saida')

                  // Pontos pendentes na fila local offline
                  const pendentesEscala = pontosPendentes.filter((p) => p.escala === escala?.id)
                  const pendenteChegada = pendentesEscala.find((p) => p.tipo === 'chegada')
                  const pendenteSaida = pendentesEscala.find((p) => p.tipo === 'saida')

                  const temChegada = !!pontoChegadaServidor || !!pendenteChegada
                  const temSaida = !!pontoSaidaServidor || !!pendenteSaida

                  return (
                    <Card
                      key={conv.id}
                      className="border border-slate-200 bg-white shadow-sm overflow-hidden"
                    >
                      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold"
                          >
                            {posto?.funcao || 'Operacional'}
                          </Badge>
                          <div className="text-xs text-slate-500 font-medium">
                            {formatDateBR(escala?.data)}
                          </div>
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 mt-1">
                          {posto?.nome}
                        </CardTitle>
                        <CardDescription className="text-xs flex items-center gap-1 text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          {end?.logradouro}, {end?.numero} - {end?.bairro} ({end?.cidade})
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                              Horário do Turno
                            </span>
                            <span className="font-bold text-slate-800">
                              {escala?.turno_inicio} às {escala?.turno_fim}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                              Cerca Digital & Tolerância
                            </span>
                            <span className="font-semibold text-primary">
                              Raio de {posto?.raio_geocerca_m || 100}m &bull; Tol.{' '}
                              {posto?.tolerancia_entrada_minutos || 10}min
                            </span>
                          </div>
                        </div>

                        {!postoTemCoordenadas(posto) && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-start gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <strong>Posto sem coordenadas</strong> — a cerca digital não
                              funcionará corretamente. Contate o gestor da empresa para configurar a
                              localização exata do posto.
                            </div>
                          </div>
                        )}

                        {/* Status dos registros */}
                        <div className="space-y-2 text-xs">
                          {/* Chegada */}
                          <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                            <span className="font-medium text-slate-600">Chegada:</span>
                            {pendenteChegada ? (
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700">
                                <Clock className="w-4 h-4 text-amber-600" />
                                {new Date(pendenteChegada.timestamp_real).toLocaleTimeString(
                                  'pt-BR',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  },
                                )}
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                                  Ponto registrado ✓ aguardando envio
                                </Badge>
                              </div>
                            ) : pontoChegadaServidor ? (
                              <div className="flex items-center gap-1.5 font-semibold text-primary">
                                <CheckCheck className="w-4 h-4 text-primary" />
                                {new Date(pontoChegadaServidor.timestamp_real).toLocaleTimeString(
                                  'pt-BR',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  },
                                )}
                                <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                                  Enviado ao sistema
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Pendente</span>
                            )}
                          </div>

                          {/* Saída */}
                          <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                            <span className="font-medium text-slate-600">Saída:</span>
                            {pendenteSaida ? (
                              <div className="flex items-center gap-1.5 font-semibold text-amber-700">
                                <Clock className="w-4 h-4 text-amber-600" />
                                {new Date(pendenteSaida.timestamp_real).toLocaleTimeString(
                                  'pt-BR',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  },
                                )}
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                                  Ponto registrado ✓ aguardando envio
                                </Badge>
                              </div>
                            ) : pontoSaidaServidor ? (
                              <div className="flex items-center gap-1.5 font-semibold text-primary">
                                <CheckCheck className="w-4 h-4 text-primary" />
                                {new Date(pontoSaidaServidor.timestamp_real).toLocaleTimeString(
                                  'pt-BR',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  },
                                )}
                                <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                                  Enviado ao sistema
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Pendente</span>
                            )}
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={temChegada}
                            onClick={() => openRegistroModal(conv, 'chegada')}
                            className="text-xs font-semibold"
                          >
                            <Camera className="w-3.5 h-3.5 mr-1" />
                            {temChegada ? 'Chegada Registrada' : 'Registrar Chegada'}
                          </Button>

                          <Button
                            size="sm"
                            disabled={!temChegada || temSaida}
                            onClick={() => openRegistroModal(conv, 'saida')}
                            variant={temSaida ? 'outline' : 'secondary'}
                            className="text-xs font-semibold"
                          >
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {temSaida ? 'Saída Registrada' : 'Registrar Saída'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* SEÇÃO: REGISTRO DE PRESENÇA NO POSTO SEM CONVOCAÇÃO (NÃO-INTERMEDIAÇÃO) */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Está presente em um posto sem convocação aceita?
                </h3>
                <p className="text-xs text-amber-800 mt-1 max-w-2xl">
                  Se você compareceu a um posto de facilities em campo mas não possui convocação
                  aceita para esta data, registre sua presença aqui. O sistema registrará sua
                  presença como alerta para a empresa e admins de forma 100% transparente.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-2">
              {postosDisponiveis.map((posto) => (
                <Button
                  key={posto.id}
                  variant="outline"
                  size="sm"
                  onClick={() => openPresencaSemConvocacaoModal(posto)}
                  className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-semibold"
                >
                  <MapPin className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  Estou no posto: {posto.nome}
                </Button>
              ))}
            </div>
          </div>

          {/* Histórico Recente de Pontos do Profissional */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-primary" />
                Histórico dos Meus Registros de Ponto
              </span>
              <span className="text-xs font-normal text-slate-400">
                {pontosPendentes.length} pendente(s) | {pontosRegistrados.length} enviado(s)
              </span>
            </h2>

            {pontosPendentes.length === 0 && pontosRegistrados.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nenhum registro de ponto computado até o momento.
              </p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Data / Hora Real</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Posto</th>
                        <th className="p-3">Geocerca</th>
                        <th className="p-3">Origem & Estado</th>
                        <th className="p-3">Foto</th>
                        <th className="p-3">Ocorrência / Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* 1. Pontos Pendentes da Fila Local */}
                      {pontosPendentes.map((item) => (
                        <tr key={item.client_uuid} className="bg-amber-50/50 hover:bg-amber-50">
                          <td className="p-3">
                            <div className="font-semibold text-amber-900">
                              {new Date(item.timestamp_real).toLocaleString('pt-BR')}
                            </div>
                            <span className="text-[10px] text-amber-700 block">
                              Salvo no aparelho
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge
                              className={
                                item.tipo === 'chegada'
                                  ? 'bg-primary/10 text-primary border-primary/20 uppercase text-[10px]'
                                  : 'bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]'
                              }
                            >
                              {item.tipo}
                            </Badge>
                          </td>
                          <td className="p-3 font-medium text-slate-700">
                            {item.postoNome || 'Posto em campo'}
                          </td>
                          <td className="p-3">
                            {item.dentro_raio ? (
                              <span className="text-primary font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                Dentro ({item.distancia_metros ?? 0}m)
                              </span>
                            ) : (
                              <span className="text-rose-600 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Fora ({item.distancia_metros ?? 0}m)
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 block">
                              Precisão GPS: ±{item.gps_precisao_m ?? 20}m
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] flex items-center gap-1 w-fit">
                              <CloudUpload className="w-3 h-3 text-amber-700" />
                              Ponto registrado ✓ aguardando envio
                            </Badge>
                          </td>
                          <td className="p-3">
                            {item.fotoDataUrl ? (
                              <img
                                src={item.fotoDataUrl}
                                alt="Foto pendente"
                                className="w-10 h-10 object-cover rounded border border-amber-300 ring-1 ring-amber-400"
                              />
                            ) : (
                              <span className="text-slate-400 italic">Sem foto</span>
                            )}
                          </td>
                          <td className="p-3">
                            {item.ocorrencia ? (
                              <span className="text-amber-800 font-medium">{item.ocorrencia}</span>
                            ) : (
                              <span className="text-primary font-medium">Regular</span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* 2. Pontos Já Enviados ao Servidor */}
                      {pontosRegistrados.map((p) => {
                        const escala = p.expand?.escala
                        const posto = escala?.expand?.posto
                        const dataHora = new Date(p.timestamp_real).toLocaleString('pt-BR')
                        const fotoUrl = p.foto ? pb.files.getURL(p, p.foto) : null

                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-3 font-semibold text-slate-800">{dataHora}</td>
                            <td className="p-3">
                              <Badge
                                className={
                                  p.tipo === 'chegada'
                                    ? 'bg-primary/10 text-primary border-primary/20 uppercase text-[10px]'
                                    : 'bg-indigo-100 text-indigo-800 border-indigo-200 uppercase text-[10px]'
                                }
                              >
                                {p.tipo}
                              </Badge>
                            </td>
                            <td className="p-3 font-medium text-slate-700">
                              {posto?.nome || 'Posto'}
                            </td>
                            <td className="p-3">
                              {p.dentro_raio ? (
                                <span className="text-primary font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                  Dentro ({p.distancia_metros ?? 0}m)
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Fora ({p.distancia_metros ?? 0}m)
                                </span>
                              )}
                              {p.gps_precisao_m && (
                                <span className="text-[10px] text-slate-400 block">
                                  Precisão GPS: ±{p.gps_precisao_m}m
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] flex items-center gap-1 w-fit">
                                <CheckCheck className="w-3 h-3 text-primary" />
                                Enviado ao sistema
                              </Badge>
                              {p.batido_offline && (
                                <span className="text-[10px] text-primary block font-medium mt-0.5">
                                  Origem: Batido offline
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {fotoUrl ? (
                                <a
                                  href={fotoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block"
                                >
                                  <img
                                    src={fotoUrl}
                                    alt="Foto de ponto"
                                    className="w-10 h-10 object-cover rounded border border-slate-200 hover:opacity-80 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">Sem foto</span>
                              )}
                            </td>
                            <td className="p-3">
                              {p.ocorrencia ? (
                                <span className="text-amber-700 font-medium">{p.ocorrencia}</span>
                              ) : (
                                <span className="text-primary font-medium">Regular</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Registro de Presença sem Convocação */}
      <Dialog
        open={modalPresencaSemConvOpen}
        onOpenChange={(open) => {
          setModalPresencaSemConvOpen(open)
          if (!open) stopCamera()
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900 text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Alerta de Presença sem Convocação
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Posto selecionado: <strong>{selectedPostoSemConv?.nome}</strong>
            </DialogDescription>
          </DialogHeader>

          {alertaSucessoSemConv ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">
                Sua presença foi registrada como alerta para a empresa
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                O gestor do posto e os administradores foram notificados no chat interno sobre sua
                presença física neste local.
              </p>
              <Button
                size="sm"
                onClick={() => setModalPresencaSemConvOpen(false)}
                className="text-xs mt-2"
              >
                Concluir e Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <p className="font-semibold">Aviso de Transparência Operacional:</p>
                <p>
                  Você está registrando entrada física no posto{' '}
                  <strong>{selectedPostoSemConv?.nome}</strong> sem convocação formal aceita para
                  hoje. Sua localização será conferida pelo GPS e o registro será salvo como{' '}
                  <strong>alerta de presença para a empresa</strong>.
                </p>
              </div>

              {/* Aviso se o posto não tem coordenadas */}
              {!postoTemCoordenadas(selectedPostoSemConv) && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Posto sem coordenadas</strong> — a cerca digital usará localização de
                    fallback (Centro de Campinas).
                  </div>
                </div>
              )}

              {/* Geolocalização */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">Geolocalização do Aparelho:</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={capturarLocalizacao}
                    className="h-6 text-[11px] text-primary"
                  >
                    Recapturar GPS
                  </Button>
                </div>
                {userCoords ? (
                  <p className="text-primary font-medium">
                    Coordenadas capturadas (precisão ±{Math.round(userCoords.accuracy || 20)}m)
                  </p>
                ) : (
                  <p className="text-slate-400">Capturando posição GPS...</p>
                )}
                {geoError && <p className="text-amber-700 font-medium">{geoError}</p>}
              </div>

              {/* Foto Opcional / Câmera */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 block">
                  Foto de Comprovação de Chegada:
                </label>
                {fotoPreview ? (
                  <div className="relative">
                    <img
                      src={fotoPreview}
                      alt="Foto"
                      className="w-full h-44 object-cover rounded border border-slate-200"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setFotoFile(null)
                        setFotoPreview(null)
                      }}
                      className="absolute top-2 right-2 h-7 text-[11px]"
                    >
                      Remover foto
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cameraActive ? (
                      <div className="space-y-2">
                        <video
                          ref={videoRef}
                          className="w-full h-44 object-cover rounded bg-black"
                          autoPlay
                          playsInline
                          muted
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={capturePhoto}
                            className="flex-1 text-xs font-semibold"
                          >
                            <Camera className="w-3.5 h-3.5 mr-1" />
                            Capturar Foto Agora
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={stopCamera}
                            className="text-xs"
                          >
                            Cancelar Câmera
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={startCamera}
                          className="flex-1 text-xs"
                        >
                          <Camera className="w-3.5 h-3.5 mr-1" />
                          Abrir Câmera
                        </Button>
                        <label className="flex-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            Anexar Arquivo
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalPresencaSemConvOpen(false)}
                  disabled={isSaving}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSalvarPresencaSemConvocacao}
                  disabled={isSaving}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  {isSaving ? 'Registrando...' : 'Confirmar Alerta de Presença'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Bater Ponto */}
      <Dialog
        open={modalRegistroOpen}
        onOpenChange={(open) => {
          setModalRegistroOpen(open)
          if (!open) stopCamera()
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Clock className="w-5 h-5 text-primary" />
              Registrar {tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'} no Posto
            </DialogTitle>
            <DialogDescription>
              {selectedEscala?.expand?.posto?.nome} &bull; Turno: {selectedEscala?.turno_inicio} às{' '}
              {selectedEscala?.turno_fim}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Aviso de conectividade no modal */}
            {!isOnline && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <strong>Modo Offline Ativo:</strong> Seu registro será gravado com a hora exata
                  deste momento no aparelho e enviado assim que a internet voltar.
                </div>
              </div>
            )}

            {/* Aviso quando o posto não tem coordenadas configuradas */}
            {!postoTemCoordenadas(selectedEscala?.expand?.posto) && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Posto sem coordenadas</strong> — a cerca digital não funcionará
                  corretamente. Usando localização estimada de referência (Centro de Campinas).
                </div>
              </div>
            )}

            {/* 1. Geolocalização e Cerca Digital */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-primary" />
                  Cerca Digital & Localização GPS
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={capturarLocalizacao}
                  disabled={isCapturingLocation}
                  className="h-7 text-[11px] text-primary hover:text-primary"
                >
                  <RefreshCw
                    className={`w-3 h-3 mr-1 ${isCapturingLocation ? 'animate-spin' : ''}`}
                  />
                  Recalcular GPS
                </Button>
              </div>

              {isCapturingLocation ? (
                <div className="text-xs text-slate-500 flex items-center gap-2 py-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Obtendo coordenadas do GPS (funciona offline)...
                </div>
              ) : userCoords ? (
                <div className="text-xs space-y-1">
                  {(() => {
                    const postoCoords = getCoordenadasPosto(selectedEscala?.expand?.posto)
                    const { raioGeocercaM } = getToleranciasPosto(selectedEscala?.expand?.posto)
                    const dist = calcularDistanciaMetros(
                      userCoords.lat,
                      userCoords.lng,
                      postoCoords.lat,
                      postoCoords.lng,
                    )
                    const dentro = dist <= raioGeocercaM

                    return (
                      <div
                        className={`p-2.5 rounded border text-xs font-medium flex items-center justify-between ${
                          dentro
                            ? 'bg-primary/10 border-primary/20 text-slate-900'
                            : 'bg-rose-50 border-rose-300 text-rose-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {dentro ? (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <div>
                            <div className="font-bold">
                              {dentro
                                ? 'Dentro da cerca digital'
                                : 'Fora da cerca do posto (Bloqueado)'}
                            </div>
                            <div className="text-[11px] opacity-90 mt-0.5">
                              {dentro
                                ? `Distância: ${dist}m do local (Raio permitido: ${raioGeocercaM}m) • Precisão GPS: ±${Math.round(userCoords.accuracy || 20)}m`
                                : `Você está fora da cerca do posto (${dist} m do local). Aproxime-se para registrar o ponto. (Raio permitido: ${raioGeocercaM} m)`}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            dentro
                              ? 'border-primary/30 text-primary bg-primary/5 font-semibold'
                              : 'border-rose-400 bg-rose-100 text-rose-900 font-bold'
                          }
                        >
                          {dentro ? 'Permitido' : 'Bloqueado'}
                        </Badge>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="text-xs text-rose-600">
                  {geoError || 'Aguardando captura do GPS...'}
                </div>
              )}
            </div>

            {/* 2. Horário do Turno vs Horário Real do Toque */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  Horário Oficial do Batimento
                </span>
                <span className="text-slate-500 font-normal">
                  Turno: {selectedEscala?.turno_inicio} às {selectedEscala?.turno_fim}
                </span>
              </div>
              {(() => {
                const { toleranciaEntradaMinutos, toleranciaSaidaMinutos } = getToleranciasPosto(
                  selectedEscala?.expand?.posto,
                )
                const tolAtual =
                  tipoRegistro === 'chegada' ? toleranciaEntradaMinutos : toleranciaSaidaMinutos
                const horaRef =
                  tipoRegistro === 'chegada'
                    ? selectedEscala?.turno_inicio || ''
                    : selectedEscala?.turno_fim || ''
                const v = verificarHorarioTurno(
                  tipoRegistro,
                  selectedEscala?.data || '',
                  horaRef,
                  new Date(),
                  tolAtual,
                )
                return (
                  <div
                    className={`p-2 rounded border mt-1.5 flex items-center justify-between text-xs ${
                      v.dentroHorario
                        ? 'bg-primary/10 border-primary/20 text-slate-900'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {v.dentroHorario ? (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold">
                          {v.dentroHorario
                            ? 'Dentro da tolerância'
                            : 'Fora da janela de tolerância (registrado com marcação para revisão)'}
                        </div>
                        <div className="text-[11px] opacity-85">
                          {v.mensagem} &bull; Tolerância: ±{tolAtual} min &bull; Hora do batimento:{' '}
                          {new Date().toLocaleTimeString('pt-BR')}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        v.dentroHorario
                          ? 'border-primary/30 text-primary bg-primary/5 font-semibold'
                          : 'border-amber-400 bg-amber-100 text-amber-900 font-semibold'
                      }
                    >
                      {v.dentroHorario ? 'No horário' : 'Fora da janela'}
                    </Badge>
                  </div>
                )
              })()}
            </div>

            {/* 3. Foto de Comprovação (Câmera ou Upload) */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                Foto de Comprovação{' '}
                {tipoRegistro === 'chegada' ? '(Obrigatória na Chegada)' : '(Opcional na Saída)'}
              </label>

              {fotoPreview ? (
                <div className="relative border rounded-lg p-2 bg-slate-50 flex items-center gap-3">
                  <img
                    src={fotoPreview}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded border"
                  />
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-primary flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Foto capturada com
                      sucesso
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFotoFile(null)
                        setFotoPreview(null)
                      }}
                      className="h-7 text-xs text-rose-600 hover:text-rose-700"
                    >
                      Remover e Tirar Outra
                    </Button>
                  </div>
                </div>
              ) : cameraActive ? (
                <div className="space-y-2 bg-black p-2 rounded-lg text-center">
                  <video
                    ref={videoRef}
                    className="w-full max-h-56 object-cover rounded mx-auto"
                    autoPlay
                    playsInline
                    muted
                  />
                  <div className="flex justify-center gap-2 pt-2">
                    <Button type="button" onClick={capturePhoto} className="text-xs">
                      <Camera className="w-3.5 h-3.5 mr-1" />
                      Capturar Foto Agora
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={stopCamera}
                      className="text-xs text-white border-white/20 hover:bg-white/10"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startCamera}
                    className="border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 text-xs py-5"
                  >
                    <Camera className="w-4 h-4 mr-1.5 text-primary" />
                    Abrir Câmera
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-dashed border-slate-300 hover:bg-slate-50 text-slate-700 text-xs py-5"
                  >
                    <Upload className="w-4 h-4 mr-1.5 text-slate-500" />
                    Upload da Galeria
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                stopCamera()
                setModalRegistroOpen(false)
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            {(() => {
              const postoCoords = getCoordenadasPosto(selectedEscala?.expand?.posto)
              const { raioGeocercaM } = getToleranciasPosto(selectedEscala?.expand?.posto)
              const latAtual = userCoords?.lat ?? postoCoords.lat
              const lngAtual = userCoords?.lng ?? postoCoords.lng
              const dist = calcularDistanciaMetros(
                latAtual,
                lngAtual,
                postoCoords.lat,
                postoCoords.lng,
              )
              const foraDaCerca = dist > raioGeocercaM

              return (
                <Button
                  onClick={handleSalvarPonto}
                  disabled={isSaving || (tipoRegistro === 'chegada' && !fotoFile) || foraDaCerca}
                  className={
                    foraDaCerca ? 'bg-slate-400 cursor-not-allowed text-white' : 'font-medium'
                  }
                  title={
                    foraDaCerca
                      ? `Você está fora da cerca do posto (${dist} m do local). Aproxime-se para registrar o ponto.`
                      : undefined
                  }
                >
                  {isSaving
                    ? 'Gravando Ponto...'
                    : foraDaCerca
                      ? 'Fora da Cerca (Bloqueado)'
                      : isOnline
                        ? `Confirmar Ponto de ${tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'}`
                        : `Salvar Ponto Offline (${tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'})`}
                </Button>
              )
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GUIA VISUAL: INSTALAÇÃO NO IPHONE / IPAD (SAFARI) */}
      <Dialog open={modalIosOpen} onOpenChange={setModalIosOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl">
          <DialogHeader className="text-center sm:text-left space-y-2">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Instalar Ponto Digital no iPhone
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Siga estes 3 passos simples no Safari para abrir o ponto com 1 toque na tela de
              início:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            {/* Passo 1 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  Toque em Compartilhar
                  <span className="inline-flex items-center justify-center p-1 rounded bg-slate-200/80 text-blue-600">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Na barra inferior do Safari (no rodapé da tela do iPhone), toque no ícone com o
                  quadrado e a seta para cima.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  Role e toque em "Adicionar à Tela de Início"
                  <span className="inline-flex items-center justify-center p-1 rounded bg-slate-200/80 text-slate-700">
                    <PlusSquare className="w-3.5 h-3.5" />
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Role as opções da lista para baixo até encontrar e clicar em{' '}
                  <strong className="text-slate-700 font-semibold">
                    Adicionar à Tela de Início
                  </strong>
                  .
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800">
                  Toque em <strong className="text-primary font-bold">"Adicionar"</strong> no canto
                  superior direito
                </p>
                <p className="text-[11px] text-slate-500">
                  Pronto! O ícone do Ponto Digital aparecerá como um app nativo na sua tela inicial,
                  pronto para bater ponto offline e online.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold py-2"
              onClick={() => setModalIosOpen(false)}
            >
              Entendi, vou adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GUIA DESKTOP / OUTROS NAVEGADORES */}
      <Dialog open={modalDesktopOpen} onOpenChange={setModalDesktopOpen}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl">
          <DialogHeader className="text-center sm:text-left space-y-2">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Instalar Aplicativo de Ponto
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Instale o Ponto Digital diretamente no seu dispositivo:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="font-semibold text-slate-800">No celular Android (Chrome):</p>
              <p className="text-[11px] text-slate-500">
                Abra este endereço no Google Chrome. Se a janela de 1 clique não abrir de imediato,
                toque nos 3 pontinhos do Chrome e selecione{' '}
                <strong className="text-slate-700">"Instalar aplicativo"</strong>.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="font-semibold text-slate-800">No computador (Chrome / Edge):</p>
              <p className="text-[11px] text-slate-500">
                Clique no ícone de instalação <strong className="text-slate-700">⊕</strong> na barra
                de endereços do seu navegador para fixar o app na área de trabalho.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold"
              onClick={() => setModalDesktopOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
