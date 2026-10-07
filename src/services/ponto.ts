// src/services/ponto.ts
import { Endereco, PostoRecord } from '@/types/facilities'

/**
 * Converte graus em radianos
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Fórmula de Haversine para calcular a distância em metros entre duas coordenadas geográficas
 */
export function calcularDistanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000 // Raio da Terra em metros
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Coordenadas de fallback para Campinas (Praça Carlos Gomes)
 */
export const COORDENADAS_FALLBACK_CAMPINAS = {
  lat: -22.9056,
  lng: -47.0608,
}

/**
 * Coordenadas geográficas do posto.
 * Prioriza SEMPRE as coordenadas reais salvas no posto (`latitude` e `longitude`).
 * Se não informadas, recorre ao objeto `endereco` se tiver lat/lng, ou fallback de Campinas (Praça Carlos Gomes).
 */
export function getCoordenadasPosto(posto?: PostoRecord): { lat: number; lng: number } {
  const latNum = Number(posto?.latitude)
  const lngNum = Number(posto?.longitude)
  if (
    posto?.latitude !== undefined &&
    posto?.latitude !== null &&
    !isNaN(latNum) &&
    latNum !== 0 &&
    posto?.longitude !== undefined &&
    posto?.longitude !== null &&
    !isNaN(lngNum) &&
    lngNum !== 0
  ) {
    return { lat: latNum, lng: lngNum }
  }

  // Tenta extrair das propriedades de endereco se existirem
  const end = posto?.endereco as
    | (Endereco & { latitude?: number; longitude?: number; lat?: number; lng?: number })
    | undefined
  const endLat = Number(end?.latitude ?? end?.lat)
  const endLng = Number(end?.longitude ?? end?.lng)
  if (!isNaN(endLat) && endLat !== 0 && !isNaN(endLng) && endLng !== 0) {
    return { lat: endLat, lng: endLng }
  }

  // Fallback padrão para postos legados sem coordenadas: Centro de Campinas (Praça Carlos Gomes)
  return { ...COORDENADAS_FALLBACK_CAMPINAS }
}

/**
 * Verifica se o posto possui coordenadas reais cadastradas (diferentes de zero/nulo).
 */
export function postoTemCoordenadas(posto?: PostoRecord): boolean {
  if (!posto) return false
  const latNum = Number(posto.latitude)
  const lngNum = Number(posto.longitude)
  if (
    posto.latitude !== undefined &&
    posto.latitude !== null &&
    !isNaN(latNum) &&
    latNum !== 0 &&
    posto.longitude !== undefined &&
    posto.longitude !== null &&
    !isNaN(lngNum) &&
    lngNum !== 0
  ) {
    return true
  }
  const end = posto.endereco as
    | (Endereco & { latitude?: number; longitude?: number; lat?: number; lng?: number })
    | undefined
  const endLat = Number(end?.latitude ?? end?.lat)
  const endLng = Number(end?.longitude ?? end?.lng)
  return !isNaN(endLat) && endLat !== 0 && !isNaN(endLng) && endLng !== 0
}

/**
 * Obtém as tolerâncias de entrada e saída configuradas para o posto (padrão 10 min)
 */
export function getToleranciasPosto(posto?: PostoRecord): {
  toleranciaEntradaMinutos: number
  toleranciaSaidaMinutos: number
  raioGeocercaM: number
} {
  const raio = Number(posto?.raio_geocerca_m) || 100
  const entrada = Number(posto?.tolerancia_entrada_minutos) || 10
  // Se tolerancia_saida_minutos for omitido ou não definido, utiliza a de entrada ou 10
  const saida = Number(posto?.tolerancia_saida_minutos) || entrada || 10

  return {
    raioGeocercaM: Math.max(20, Math.min(1000, raio)),
    toleranciaEntradaMinutos: Math.max(1, entrada),
    toleranciaSaidaMinutos: Math.max(1, saida),
  }
}

/**
 * Compara se o horário real está muito distante do horário programado do turno
 * Baseado na tolerância do posto (padrão sugerido: 10 minutos)
 */
export function verificarHorarioTurno(
  tipo: 'chegada' | 'saida',
  dataTurnoIso: string,
  turnoHora: string, // ex: "07:00"
  timestampReal: Date = new Date(),
  toleranciaMinutos: number = 10,
): { dentroHorario: boolean; diferencaMinutos: number; mensagem: string } {
  try {
    const dataOnly = dataTurnoIso.slice(0, 10)
    const [h, m] = turnoHora.split(':').map(Number)
    const dataProgramada = new Date(
      `${dataOnly}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
    )

    // Se turnoHora for inválido
    if (isNaN(dataProgramada.getTime())) {
      return { dentroHorario: true, diferencaMinutos: 0, mensagem: 'Horário do turno indefinido' }
    }

    const diffMs = timestampReal.getTime() - dataProgramada.getTime()
    const diffMinutos = Math.round(diffMs / 60000)

    const absDiff = Math.abs(diffMinutos)
    const dentro = absDiff <= toleranciaMinutos

    let msg = 'No horário do turno'
    if (diffMinutos > toleranciaMinutos) {
      msg = `${absDiff} min atrasado em relação a ${turnoHora}`
    } else if (diffMinutos < -toleranciaMinutos) {
      msg = `${absDiff} min adiantado em relação a ${turnoHora}`
    }

    return {
      dentroHorario: dentro,
      diferencaMinutos: diffMinutos,
      mensagem: msg,
    }
  } catch (_) {
    return { dentroHorario: true, diferencaMinutos: 0, mensagem: 'OK' }
  }
}
