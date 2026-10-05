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

export function getLogoUrl(settings: SettingsRecord | null | undefined): string | null {
  if (!settings || !settings.id || !settings.logo) return null
  return pb.files.getURL(settings, settings.logo)
}

export interface DiariaCalculadaResponse {
  valor: number
  regra_aplicada: string
  is_fixa?: boolean
  tipo_remuneracao?: 'mensal' | 'por_hora' | 'mensalista' | 'horista'
  valor_mensal?: number
  valor_hora?: number
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
    const posto = (escala as any)?.expand?.posto
    const carga = posto?.carga_horaria || 8

    // Regra fixa
    if (posto?.pro_fixo && posto.pro_fixo === proId) {
      const forma = posto.forma_de_contratacao || posto.tipo_remuneracao_fixa || 'mensalista'
      const salMensal =
        posto.salario_mensal !== undefined
          ? Number(posto.salario_mensal)
          : forma === 'mensalista' || forma === 'mensal'
            ? Number(posto.valor_remuneracao_fixa || 0)
            : 0
      const vHora =
        posto.valor_hora !== undefined
          ? Number(posto.valor_hora)
          : forma === 'horista' || forma === 'por_hora'
            ? Number(posto.valor_remuneracao_fixa || 0)
            : 0

      if (forma === 'mensalista' || forma === 'mensal') {
        return {
          valor: 0,
          valor_mensal: salMensal,
          is_fixa: true,
          tipo_remuneracao: 'mensalista',
          regra_aplicada: 'Contrato Mensal Fixo — Remuneração Salarial',
        }
      } else if (forma === 'horista' || forma === 'por_hora') {
        const total = carga * vHora
        return {
          valor: total,
          valor_hora: vHora,
          is_fixa: true,
          tipo_remuneracao: 'horista',
          regra_aplicada: `profissional fixa horista (R$ ${vHora.toFixed(2)}/h × ${carga}h)`,
        }
      }
    }

    if (pro.status === 'teste') {
      return {
        valor: pro.ajuda_custo || 50,
        regra_aplicada: 'ajuda de custo (teste)',
        is_fixa: false,
      }
    }

    if (pro.valor_negociado && pro.valor_negociado > 0) {
      return {
        valor: pro.valor_negociado,
        regra_aplicada: 'valor negociado',
        is_fixa: false,
      }
    }

    const valorBase = carga <= 4 ? 130 : carga <= 6 ? 160 : 180
    return {
      valor: valorBase,
      regra_aplicada: `tabela base (${carga}h)`,
      is_fixa: false,
    }
  } catch {
    return {
      valor: 180,
      regra_aplicada: 'tabela base (8h)',
      is_fixa: false,
    }
  }
}

/**
 * Calcula a diária de freelancer em determinado posto e data considerando regras base,
 * fim de semana e feriados (para cálculo dinâmico em lote)
 */
export async function estimarDiariaParaData(
  postoId: string,
  dataStr: string, // YYYY-MM-DD
  cargaHoraria: number,
  cidadePosto?: string,
  ufPosto?: string,
): Promise<{ valor: number; regra: string }> {
  try {
    const parts = dataStr.slice(0, 10).split('-')
    const dt = new Date(
      Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)),
    )
    const dayOfWeek = dt.getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    let valorBase = cargaHoraria <= 4 ? 130 : cargaHoraria <= 6 ? 160 : 180
    let regraBase = `tabela base (${cargaHoraria}h)`

    const baseRules = await pb.collection('pricing_rules').getFullList({
      filter: `tipo = "base"`,
      sort: 'faixa_horas',
    })
    if (baseRules.length > 0) {
      let chosen = baseRules[0]
      for (const r of baseRules) {
        if (r.faixa_horas === cargaHoraria) {
          chosen = r
          break
        }
        if (r.faixa_horas && r.faixa_horas < cargaHoraria) {
          chosen = r
        }
      }
      valorBase = chosen.valor
      regraBase = `tabela base (${chosen.faixa_horas}h)`
    }

    // Treinamento no posto
    const treinoRules = await pb.collection('pricing_rules').getFullList({
      filter: `tipo = "treinamento" && posto = "${postoId}"`,
      sort: '-created',
    })
    for (const tr of treinoRules) {
      if (tr.vigencia_inicio) {
        const startStr = tr.vigencia_inicio.slice(0, 10).split('-')
        const stDate = new Date(
          Date.UTC(
            parseInt(startStr[0], 10),
            parseInt(startStr[1], 10) - 1,
            parseInt(startStr[2], 10),
          ),
        )
        const diffMs = dt.getTime() - stDate.getTime()
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const diasTotais = tr.dias || 10
        if (diffDias >= 0 && diffDias < diasTotais) {
          return {
            valor: tr.valor,
            regra: `treinamento (${diasTotais - diffDias} dias rest.)`,
          }
        }
      }
    }

    // Fim de semana
    if (isWeekend) {
      const fdsRules = await pb.collection('pricing_rules').getFullList({
        filter: `tipo = "fim_semana" && posto = "${postoId}"`,
      })
      if (fdsRules.length > 0) {
        return {
          valor: fdsRules[0].valor,
          regra: 'fim de semana',
        }
      }
    }

    // Feriados
    const holidays = await pb.collection('holidays').getFullList({
      filter: `data ~ "${dataStr.slice(0, 10)}"`,
    })
    const uf = (ufPosto || '').trim().toUpperCase()
    for (const h of holidays) {
      const isNational = h.tipo === 'nacional'
      const isState = h.tipo === 'estadual' && h.uf && uf && h.uf.toUpperCase() === uf
      const isMunicipal =
        h.tipo === 'municipal' &&
        cidadePosto &&
        h.cidade?.toLowerCase() === cidadePosto.toLowerCase() &&
        (!h.uf || !uf || h.uf.toUpperCase() === uf)

      if (isNational || isState || isMunicipal) {
        const feriadoRules = await pb.collection('pricing_rules').getFullList({
          filter: `tipo = "feriado" && posto = "${postoId}"`,
        })
        const val = feriadoRules.length > 0 ? feriadoRules[0].valor : valorBase
        return {
          valor: val,
          regra: `feriado (${h.nome})`,
        }
      }
    }

    return {
      valor: valorBase,
      regra: regraBase,
    }
  } catch (err) {
    console.warn('Erro ao estimar diária por data:', err)
    return {
      valor: 180,
      regra: `tabela base (${cargaHoraria}h)`,
    }
  }
}
