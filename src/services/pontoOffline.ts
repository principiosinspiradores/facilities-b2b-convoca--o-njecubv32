// src/services/pontoOffline.ts
import pb from '@/lib/pocketbase/client'
import { PontoRecord, PontoTipo, PontoValidacaoStatus } from '@/types/facilities'

const DB_NAME = 'facilities_ponto_offline_db'
const DB_VERSION = 1
const STORE_NAME = 'pontos_pendentes'
const CACHE_STORE_NAME = 'app_cache'
const LAST_ONLINE_TS_KEY = 'facilities_last_known_server_online_ts'

export interface PontoPendenteItem {
  client_uuid: string
  escala: string
  pro: string
  tipo: PontoTipo
  timestamp_real: string // ISO string no instante do clique
  latitude?: number
  longitude?: number
  gps_precisao_m?: number
  dentro_raio?: boolean
  distancia_metros?: number
  raio_posto_m?: number
  tolerancia_aplicada_minutos?: number
  fora_janela?: boolean
  fotoDataUrl?: string | null // Data URL persistente da foto capturada
  fotoName?: string
  fotoType?: string
  ocorrencia?: string
  status_validacao?: PontoValidacaoStatus
  batido_offline: boolean
  horario_suspeito?: boolean
  // Metadados do contexto para exibição offline antes de subir
  postoNome?: string
  turnoInfo?: string
  criado_em: string
  tentativasEnvio: number
  ultimoErro?: string
  status: 'pendente' | 'sincronizando' | 'enviado' | 'erro'
}

/**
 * Inicializa e obtém conexão com IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não suportado neste navegador'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_uuid' })
        store.createIndex('idx_pro', 'pro', { unique: false })
        store.createIndex('idx_status', 'status', { unique: false })
        store.createIndex('idx_timestamp', 'timestamp_real', { unique: false })
      }
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Registra o timestamp da última vez que o cliente esteve online comunicando com o servidor.
 * Usado para auditoria antifraude (se batimento offline tiver data anterior a esta, marca horário suspeito).
 */
export function registrarUltimoAcessoOnline(dataIso?: string) {
  try {
    const ts = dataIso || new Date().toISOString()
    localStorage.setItem(LAST_ONLINE_TS_KEY, ts)
  } catch {
    /* intentionally ignored */
  }
}

export function getUltimoAcessoOnline(): string | null {
  try {
    return localStorage.getItem(LAST_ONLINE_TS_KEY)
  } catch (_) {
    return null
  }
}

/**
 * Avalia se o horário do batimento é suspeito em relação ao último acesso online conhecido do aparelho.
 * Se o relógio do aparelho foi atrasado para antes do último acesso registrado, acusa horário suspeito.
 */
export function verificarHorarioSuspeito(timestampBatimento: string): boolean {
  try {
    const ultimoAcesso = getUltimoAcessoOnline()
    if (!ultimoAcesso) return false
    const tBatimento = new Date(timestampBatimento).getTime()
    const tUltimoAcesso = new Date(ultimoAcesso).getTime()
    // Se o ponto foi batido com data anterior ao último acesso online conhecido com tolerância de 5 minutos
    if (tBatimento < tUltimoAcesso - 5 * 60 * 1000) {
      return true
    }
  } catch {
    /* intentionally ignored */
  }
  return false
}

/**
 * Salva um ponto na fila persistente do IndexedDB (com fallback localStorage)
 */
export async function salvarPontoOffline(ponto: PontoPendenteItem): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(ponto)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Falha no IndexedDB, usando fallback em localStorage:', err)
    // Fallback simples em localStorage
    try {
      const fila = getPontosFallbackLocalStorage()
      const index = fila.findIndex((p) => p.client_uuid === ponto.client_uuid)
      if (index >= 0) {
        fila[index] = ponto
      } else {
        fila.push(ponto)
      }
      localStorage.setItem('facilities_pontos_offline_fallback', JSON.stringify(fila))
    } catch (lsErr) {
      console.error('Falha crítica ao persistir ponto localmente:', lsErr)
      throw lsErr
    }
  }
}

function getPontosFallbackLocalStorage(): PontoPendenteItem[] {
  try {
    const raw = localStorage.getItem('facilities_pontos_offline_fallback')
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

/**
 * Obtém todos os pontos pendentes da fila local para um profissional específico
 */
export async function listarPontosPendentes(proId?: string): Promise<PontoPendenteItem[]> {
  let itens: PontoPendenteItem[] = []
  try {
    const db = await openDB()
    itens = await new Promise<PontoPendenteItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Erro ao ler IndexedDB, lendo fallback:', err)
    itens = getPontosFallbackLocalStorage()
  }

  // Filtrar apenas pendentes / com erro (não enviados) e do profissional se informado
  const pendentes = itens.filter((item) => {
    if (proId && item.pro !== proId) return false
    return item.status === 'pendente' || item.status === 'erro' || item.status === 'sincronizando'
  })

  // Ordenar pela ordem de batimento cronológico (FIFO - chegada antes de saída)
  return pendentes.sort(
    (a, b) => new Date(a.timestamp_real).getTime() - new Date(b.timestamp_real).getTime(),
  )
}

/**
 * Remove um item enviado do IndexedDB
 */
export async function removerPontoPendente(client_uuid: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(client_uuid)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (_) {
    // Fallback
    try {
      const fila = getPontosFallbackLocalStorage().filter((p) => p.client_uuid !== client_uuid)
      localStorage.setItem('facilities_pontos_offline_fallback', JSON.stringify(fila))
    } catch {
      /* intentionally ignored */
    }
  }
}

/**
 * Converte DataURL base64 para File/Blob para upload no PocketBase
 */
function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

/**
 * Converte File para DataURL para armazenamento local offline
 */
export function fileToDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface SyncResult {
  sucessos: number
  falhas: number
  total: number
  detalhes: { client_uuid: string; sucesso: boolean; erro?: string; id?: string }[]
}

// Bloqueio de sincronização concorrente
let isSyncInProgress = false

/**
 * Executa a sincronização dos pontos pendentes enviando-os ao PocketBase
 */
export async function sincronizarPontosPendentes(proId?: string): Promise<SyncResult> {
  if (isSyncInProgress) {
    return { sucessos: 0, falhas: 0, total: 0, detalhes: [] }
  }

  // Verifica conectividade
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sucessos: 0, falhas: 0, total: 0, detalhes: [] }
  }

  isSyncInProgress = true
  const resultado: SyncResult = { sucessos: 0, falhas: 0, total: 0, detalhes: [] }

  try {
    const itens = await listarPontosPendentes(proId)
    resultado.total = itens.length

    if (itens.length === 0) {
      registrarUltimoAcessoOnline()
      return resultado
    }

    const agoraSync = new Date()
    registrarUltimoAcessoOnline(agoraSync.toISOString())

    for (const item of itens) {
      try {
        // Marca como em sincronização
        item.status = 'sincronizando'
        item.tentativasEnvio = (item.tentativasEnvio || 0) + 1
        await salvarPontoOffline(item)

        // Idempotência / Anti-duplicação: verificar se este client_uuid já subiu antes
        if (item.client_uuid) {
          try {
            const existente = await pb
              .collection('pontos')
              .getFirstListItem<PontoRecord>(`client_uuid = "${item.client_uuid}"`)
            if (existente?.id) {
              // Já existe no servidor, podemos remover da fila local
              await removerPontoPendente(item.client_uuid)
              resultado.sucessos++
              resultado.detalhes.push({
                client_uuid: item.client_uuid,
                sucesso: true,
                id: existente.id,
              })
              continue
            }
          } catch (_) {
            // Registro ainda não existe no servidor (esperado), prosseguir com create
          }
        }

        // Calcula atraso da sincronização em minutos
        const batimentoDate = new Date(item.timestamp_real)
        const atrasoMs = Math.max(0, agoraSync.getTime() - batimentoDate.getTime())
        const atrasoMinutos = Math.round(atrasoMs / 60000)

        // Montar ocorrências: adicionar marcador de sincronização atrasada
        const ocorrenciasList: string[] = []
        if (item.ocorrencia) {
          ocorrenciasList.push(item.ocorrencia)
        }

        if (item.batido_offline) {
          const horasAtraso = (atrasoMinutos / 60).toFixed(1)
          if (atrasoMinutos >= 5) {
            ocorrenciasList.push(
              `Sincronizado offline com atraso de ${atrasoMinutos}min (~${horasAtraso}h)`,
            )
          } else {
            ocorrenciasList.push('Registrado offline e sincronizado')
          }
        }

        if (item.horario_suspeito) {
          ocorrenciasList.push('Horário suspeito: batimento anterior ao último acesso online')
        }

        const formData = new FormData()
        formData.append('escala', item.escala)
        formData.append('pro', item.pro)
        formData.append('tipo', item.tipo)
        // PRESERVAR HORA REAL DO BATIMENTO - não a hora da sincronização!
        formData.append('timestamp_real', item.timestamp_real)

        if (item.latitude !== undefined) formData.append('latitude', String(item.latitude))
        if (item.longitude !== undefined) formData.append('longitude', String(item.longitude))
        if (item.gps_precisao_m !== undefined)
          formData.append('gps_precisao_m', String(item.gps_precisao_m))
        if (item.dentro_raio !== undefined) formData.append('dentro_raio', String(item.dentro_raio))
        if (item.distancia_metros !== undefined)
          formData.append('distancia_metros', String(item.distancia_metros))
        if (item.raio_posto_m !== undefined)
          formData.append('raio_posto_m', String(item.raio_posto_m))
        if (item.tolerancia_aplicada_minutos !== undefined)
          formData.append('tolerancia_aplicada_minutos', String(item.tolerancia_aplicada_minutos))
        if (item.fora_janela !== undefined) formData.append('fora_janela', String(item.fora_janela))

        formData.append('status_validacao', item.status_validacao || 'valido')
        formData.append('ocorrencia', ocorrenciasList.join(' | '))
        formData.append('batido_offline', String(item.batido_offline))
        formData.append('sincronizado_em', agoraSync.toISOString())
        formData.append('atraso_sincronizacao_minutos', String(atrasoMinutos))
        formData.append('horario_suspeito', String(!!item.horario_suspeito))
        formData.append('client_uuid', item.client_uuid)

        // Anexar foto se houver dataURL
        if (item.fotoDataUrl) {
          try {
            const fileName = item.fotoName || `ponto_offline_${Date.now()}.jpg`
            const fotoFile = dataURLtoFile(item.fotoDataUrl, fileName)
            formData.append('foto', fotoFile)
          } catch (fotoErr) {
            console.warn('Erro ao decodificar foto salva offline:', fotoErr)
          }
        }

        const novoPonto = await pb.collection('pontos').create<PontoRecord>(formData)

        // Sucesso: remove da fila local
        await removerPontoPendente(item.client_uuid)
        resultado.sucessos++
        resultado.detalhes.push({
          client_uuid: item.client_uuid,
          sucesso: true,
          id: novoPonto.id,
        })
      } catch (err: any) {
        console.error(`Erro ao sincronizar ponto ${item.client_uuid}:`, err)
        item.status = 'erro'
        item.ultimoErro = err?.message || 'Falha de rede/servidor'
        await salvarPontoOffline(item)
        resultado.falhas++
        resultado.detalhes.push({
          client_uuid: item.client_uuid,
          sucesso: false,
          erro: item.ultimoErro,
        })
      }
    }
  } finally {
    isSyncInProgress = false
  }

  return resultado
}

/**
 * Cache offline para dados de escalas e histórico do pro
 * Permite que a tela Ponto carregue mesmo sem internet
 */
export async function salvarCachePro(key: string, data: any): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(CACHE_STORE_NAME)
      const req = store.put({ key, data, updated_at: new Date().toISOString() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (_) {
    try {
      localStorage.setItem(`facilities_cache_${key}`, JSON.stringify(data))
    } catch {
      /* intentionally ignored */
    }
  }
}

export async function carregarCachePro<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    const item = await new Promise<{ key: string; data: T } | undefined>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly')
      const store = tx.objectStore(CACHE_STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (item && item.data) return item.data
  } catch {
    /* intentionally ignored */
  }

  try {
    const raw = localStorage.getItem(`facilities_cache_${key}`)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}
