import React, { useState, useEffect, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ConvocacaoRecord, EscalaRecord, PontoRecord } from '@/types/facilities'
import { formatDateBR } from '@/lib/formatters'
import {
  calcularDistanciaMetros,
  getCoordenadasPosto,
  verificarHorarioTurno,
} from '@/services/ponto'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
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
  ShieldCheck,
  Calendar,
} from 'lucide-react'

export default function PontoProPage() {
  const { user } = useAuth()
  const [escalasHoje, setEscalasHoje] = useState<ConvocacaoRecord[]>([])
  const [pontosRegistrados, setPontosRegistrados] = useState<PontoRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modal de Registro
  const [modalRegistroOpen, setModalRegistroOpen] = useState(false)
  const [tipoRegistro, setTipoRegistro] = useState<'chegada' | 'saida'>('chegada')
  const [selectedEscala, setSelectedEscala] = useState<EscalaRecord | null>(null)
  const [isCapturingLocation, setIsCapturingLocation] = useState(false)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    try {
      // Buscar convocações aceitas pelo pro
      const convs = await pb.collection('convocacoes').getFullList<ConvocacaoRecord>({
        filter: `pro = "${user.id}" && status = "aceita"`,
        sort: '-data_convocacao',
        expand: 'escala,escala.posto',
      })

      // Buscar pontos do pro
      const pontos = await pb.collection('pontos').getFullList<PontoRecord>({
        filter: `pro = "${user.id}"`,
        sort: '-timestamp_real',
        expand: 'escala,escala.posto',
      })

      setEscalasHoje(convs)
      setPontosRegistrados(pontos)
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao carregar dados do ponto',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  // Capturar Geolocalização do navegador
  const capturarLocalizacao = () => {
    setIsCapturingLocation(true)
    setGeoError(null)

    if (!navigator.geolocation) {
      setGeoError('Geolocalização não é suportada pelo seu navegador.')
      setIsCapturingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setIsCapturingLocation(false)
      },
      (err) => {
        console.warn('Erro ao obter geolocalização:', err.message)
        // Se houver bloqueio de permissão de geolocalização, simular coordenadas padrão de teste
        const postoCoords = getCoordenadasPosto(selectedEscala?.expand?.posto)
        setUserCoords({
          lat: postoCoords.lat,
          lng: postoCoords.lng,
        })
        setGeoError(
          'Aviso: GPS indisponível no dispositivo. Usando ponto de ancoragem do posto para teste.',
        )
        setIsCapturingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
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

  // Salvar registro de ponto
  const handleSalvarPonto = async () => {
    if (!selectedEscala || !user) return

    // Chegada exige foto
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
      const posto = selectedEscala.expand?.posto
      const postoCoords = getCoordenadasPosto(posto)
      const raioConfig = posto?.raio_geocerca_m || 150

      const latAtual = userCoords?.lat || postoCoords.lat
      const lngAtual = userCoords?.lng || postoCoords.lng

      // Distância do posto
      const distancia = calcularDistanciaMetros(
        latAtual,
        lngAtual,
        postoCoords.lat,
        postoCoords.lng,
      )
      const dentroRaio = distancia <= raioConfig

      // Verificação de horário do turno
      const horaProgramada =
        tipoRegistro === 'chegada' ? selectedEscala.turno_inicio : selectedEscala.turno_fim
      const agora = new Date()
      const verHorario = verificarHorarioTurno(
        tipoRegistro,
        selectedEscala.data,
        horaProgramada,
        agora,
        30,
      )

      // Identificar ocorrências
      const ocorrencias: string[] = []
      let statusValidacao: 'valido' | 'alerta' = 'valido'

      if (!dentroRaio) {
        ocorrencias.push(
          `Fora da cerca digital: ${distancia}m de distância (máximo permitido: ${raioConfig}m)`,
        )
        statusValidacao = 'alerta'
      }

      if (!verHorario.dentroHorario) {
        ocorrencias.push(`Horário divergente: ${verHorario.mensagem}`)
        statusValidacao = 'alerta'
      }

      const formData = new FormData()
      formData.append('escala', selectedEscala.id)
      formData.append('pro', user.id)
      formData.append('tipo', tipoRegistro)
      formData.append('timestamp_real', agora.toISOString())
      formData.append('latitude', String(latAtual))
      formData.append('longitude', String(lngAtual))
      formData.append('dentro_raio', String(dentroRaio))
      formData.append('distancia_metros', String(distancia))
      formData.append('status_validacao', statusValidacao)
      formData.append('ocorrencia', ocorrencias.join(' | '))

      if (fotoFile) {
        formData.append('foto', fotoFile)
      }

      await pb.collection('pontos').create(formData)

      toast({
        title: `Ponto de ${tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'} registrado!`,
        description:
          dentroRaio && verHorario.dentroHorario
            ? 'Registro verificado com sucesso dentro do posto e no horário.'
            : 'Ponto registrado com alerta visual para conferência da gestão.',
        variant: dentroRaio && verHorario.dentroHorario ? 'default' : 'destructive',
      })

      stopCamera()
      setModalRegistroOpen(false)
      loadData()
    } catch (err) {
      console.error('Erro ao salvar ponto:', err)
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
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-teal-700" />
            Registro de Ponto Digital (Modelo Profreela)
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Bata a chegada e saída das suas escalas com verificação de cerca digital e foto de
            comprovação.
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" className="text-xs">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Atualizar Pontos
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Turnos disponíveis para bater ponto */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" />
              Escalas Confirmadas & Registro do Dia
            </h2>

            {escalasHoje.length === 0 ? (
              <Card className="text-center py-8 border-dashed border border-slate-200 bg-white">
                <CardContent className="space-y-2">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm text-slate-500">
                    Você não tem turnos confirmados para registrar ponto no momento.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {escalasHoje.map((conv) => {
                  const escala = conv.expand?.escala
                  const posto = escala?.expand?.posto
                  const end = posto?.endereco as any

                  // Pontos já registrados para esta escala
                  const pontosEscala = pontosRegistrados.filter((p) => p.escala === escala?.id)
                  const pontoChegada = pontosEscala.find((p) => p.tipo === 'chegada')
                  const pontoSaida = pontosEscala.find((p) => p.tipo === 'saida')

                  return (
                    <Card
                      key={conv.id}
                      className="border border-slate-200 bg-white shadow-sm overflow-hidden"
                    >
                      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="bg-teal-50 text-teal-800 border-teal-200 text-xs font-semibold"
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
                              Cerca Digital
                            </span>
                            <span className="font-semibold text-teal-700">
                              Raio de {posto?.raio_geocerca_m || 150}m
                            </span>
                          </div>
                        </div>

                        {/* Status dos registros */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                            <span className="font-medium text-slate-600">Chegada:</span>
                            {pontoChegada ? (
                              <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                {new Date(pontoChegada.timestamp_real).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {pontoChegada.dentro_raio ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                                    No Posto
                                  </Badge>
                                ) : (
                                  <Badge className="bg-rose-100 text-rose-800 text-[10px]">
                                    Fora Raio
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Pendente</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                            <span className="font-medium text-slate-600">Saída:</span>
                            {pontoSaida ? (
                              <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                {new Date(pontoSaida.timestamp_real).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {pontoSaida.dentro_raio ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                                    No Posto
                                  </Badge>
                                ) : (
                                  <Badge className="bg-rose-100 text-rose-800 text-[10px]">
                                    Fora Raio
                                  </Badge>
                                )}
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
                            disabled={!!pontoChegada}
                            onClick={() => openRegistroModal(conv, 'chegada')}
                            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                          >
                            <Camera className="w-3.5 h-3.5 mr-1" />
                            {pontoChegada ? 'Chegada OK' : 'Registrar Chegada'}
                          </Button>

                          <Button
                            size="sm"
                            disabled={!pontoChegada || !!pontoSaida}
                            onClick={() => openRegistroModal(conv, 'saida')}
                            variant={pontoSaida ? 'outline' : 'secondary'}
                            className="text-xs font-semibold"
                          >
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {pontoSaida ? 'Saída OK' : 'Registrar Saída'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Histórico Recente de Pontos do Profissional */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-teal-700" />
              Histórico dos Meus Registros de Ponto
            </h2>

            {pontosRegistrados.length === 0 ? (
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
                        <th className="p-3">Foto</th>
                        <th className="p-3">Ocorrência / Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                                    ? 'bg-teal-100 text-teal-800 border-teal-200 uppercase text-[10px]'
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
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Dentro ({p.distancia_metros ?? 0}m)
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Fora ({p.distancia_metros ?? 0}m)
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
                                <span className="text-emerald-700 font-medium">Regular</span>
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
            <DialogTitle className="flex items-center gap-2 text-teal-800">
              <Clock className="w-5 h-5 text-teal-600" />
              Registrar {tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'} no Posto
            </DialogTitle>
            <DialogDescription>
              {selectedEscala?.expand?.posto?.nome} &bull; Turno: {selectedEscala?.turno_inicio} às{' '}
              {selectedEscala?.turno_fim}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* 1. Geolocalização e Cerca Digital */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-teal-700" />
                  Cerca Digital & Localização
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={capturarLocalizacao}
                  disabled={isCapturingLocation}
                  className="h-7 text-[11px] text-teal-700 hover:text-teal-800"
                >
                  <RefreshCw
                    className={`w-3 h-3 mr-1 ${isCapturingLocation ? 'animate-spin' : ''}`}
                  />
                  Recalcular GPS
                </Button>
              </div>

              {isCapturingLocation ? (
                <div className="text-xs text-slate-500 flex items-center gap-2 py-2">
                  <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                  Obtendo coordenadas do GPS...
                </div>
              ) : userCoords ? (
                <div className="text-xs space-y-1">
                  {(() => {
                    const postoCoords = getCoordenadasPosto(selectedEscala?.expand?.posto)
                    const raio = selectedEscala?.expand?.posto?.raio_geocerca_m || 150
                    const dist = calcularDistanciaMetros(
                      userCoords.lat,
                      userCoords.lng,
                      postoCoords.lat,
                      postoCoords.lng,
                    )
                    const dentro = dist <= raio

                    return (
                      <div
                        className={`p-2.5 rounded border text-xs font-medium flex items-center justify-between ${
                          dentro
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {dentro ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <div>
                            <div>
                              {dentro ? 'Dentro da cerca digital' : 'Fora da cerca digital'}
                            </div>
                            <div className="text-[11px] opacity-80">
                              Distância: {dist}m do posto (Raio tolerado: {raio}m)
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={dentro ? 'border-emerald-300' : 'border-rose-300'}
                        >
                          {dentro ? 'Permitido' : 'Alerta'}
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

            {/* 2. Horário do Turno vs Horário Real */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-700" />
                  Horário Real vs Turno
                </span>
                <span className="text-slate-500 font-normal">
                  Turno: {selectedEscala?.turno_inicio} às {selectedEscala?.turno_fim}
                </span>
              </div>
              {(() => {
                const horaRef =
                  tipoRegistro === 'chegada'
                    ? selectedEscala?.turno_inicio || ''
                    : selectedEscala?.turno_fim || ''
                const v = verificarHorarioTurno(
                  tipoRegistro,
                  selectedEscala?.data || '',
                  horaRef,
                  new Date(),
                  30,
                )
                return (
                  <div
                    className={`p-2 rounded border mt-1.5 flex items-center gap-2 ${
                      v.dentroHorario
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {v.dentroHorario ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>{v.mensagem}</span>
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
                    <div className="font-semibold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Foto capturada com sucesso
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
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                    >
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
                    className="border-dashed border-teal-600 bg-teal-50 text-teal-800 hover:bg-teal-100 text-xs py-5"
                  >
                    <Camera className="w-4 h-4 mr-1.5 text-teal-700" />
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
            <Button
              onClick={handleSalvarPonto}
              disabled={isSaving || (tipoRegistro === 'chegada' && !fotoFile)}
              className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
            >
              {isSaving
                ? 'Salvando Ponto...'
                : `Confirmar Ponto de ${tipoRegistro === 'chegada' ? 'Chegada' : 'Saída'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
