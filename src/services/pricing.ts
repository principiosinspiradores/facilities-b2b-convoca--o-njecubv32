import pb from '@/lib/pocketbase/client'
import { SettingsRecord } from '@/types/facilities'

export async function fetchSettings(): Promise<SettingsRecord | null> {
  try {
    const list = await pb.collection('settings').getList<SettingsRecord>(1, 1, {
      sort: '-created',
    })
    return list.items[0] || null
  } catch (err) {
    console.warn('Erro ao carregar settings:', err)
    return null
  }
}

export async function updateSettings(
  id: string,
  data: Partial<SettingsRecord> | FormData,
): Promise<SettingsRecord> {
  return await pb.collection('settings').update<SettingsRecord>(id, data)
}

export interface DiariaCalculadaResponse {
  valor: number
  regra_aplicada: string
}

export async function calcularDiariaEngine(
  escalaId: string,
  proId: string,
): Promise<DiariaCalculadaResponse> {
  try {
    // Tenta chamar a rota customizada do backend
    const res = await pb.send<DiariaCalculadaResponse>(
      `/backend/v1/calcular-diaria/${escalaId}/${proId}`,
      {
        method: 'GET',
      },
    )
    if (res && typeof res.valor === 'number') {
      return res
    }
  } catch (err) {
    console.warn('Falha na rota backend calcular-diaria, executando fallback local:', err)
  }

  // Fallback seguro caso o hook customizado demore a responder
  try {
    const escala = await pb.collection('escalas').getOne(escalaId, { expand: 'posto' })
    const pro = await pb.collection('users').getOne(proId)
    const carga = (escala as any)?.expand?.posto?.carga_horaria || 8

    if (pro.status === 'teste') {
      return {
        valor: pro.ajuda_custo || 50,
        regra_aplicada: 'ajuda de custo (teste)',
      }
    }

    if (pro.valor_negociado && pro.valor_negociado > 0) {
      return {
        valor: pro.valor_negociado,
        regra_aplicada: 'valor negociado',
      }
    }

    const valorBase = carga <= 4 ? 130 : carga <= 6 ? 160 : 180
    return {
      valor: valorBase,
      regra_aplicada: `tabela base (${carga}h)`,
    }
  } catch {
    return {
      valor: 180,
      regra_aplicada: 'tabela base (8h)',
    }
  }
}
