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
 * Coordenadas estimadas de fallback para postos conhecidos caso o endereço seja em SP/etc
 */
export function getCoordenadasPosto(posto?: PostoRecord): { lat: number; lng: number } {
  if (posto?.latitude && posto?.longitude) {
    return { lat: posto.latitude, lng: posto.longitude }
  }

  // Tenta extrair das propriedades de endereco se existirem
  const end = posto?.endereco as
    | (Endereco & { latitude?: number; longitude?: number; lat?: number; lng?: number })
    | undefined
  if (end?.latitude && end?.longitude) {
    return { lat: end.latitude, lng: end.longitude }
  }
  if (end?.lat && end?.lng) {
    return { lat: end.lat, lng: end.lng }
  }

  // Fallback baseado no endereço / cidade padrão da demo (Av. Paulista 1000 ou Brás)
  if (
    posto?.nome?.toLowerCase().includes('alfa') ||
    (end?.logradouro && end.logradouro.toLowerCase().includes('paulista'))
  ) {
    return { lat: -23.561684, lng: -46.655981 } // Av. Paulista 1000
  }
  if (
    posto?.nome?.toLowerCase().includes('beta') ||
    (end?.bairro && end.bairro.toLowerCase().includes('brás'))
  ) {
    return { lat: -23.54358, lng: -46.62018 } // Brás
  }

  // Padrão Centro São Paulo - Praça da Sé
  return { lat: -23.55052, lng: -46.633308 }
}

/**
 * Compara se o horário real está muito distante do horário programado do turno
 * Tolerância padrão de 30 minutos
 */
export function verificarHorarioTurno(
  tipo: 'chegada' | 'saida',
  dataTurnoIso: string,
  turnoHora: string, // ex: "07:00"
  timestampReal: Date = new Date(),
  toleranciaMinutos: number = 30,
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
