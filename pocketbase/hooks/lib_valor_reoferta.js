// pocketbase/hooks/lib_valor_reoferta.js
// Helper compartilhado para o VALOR BASE da reoferta (no-show, recusa da fixa,
// cancelamento aceito, "não vou hoje" e retomada emergencial).
//
// Regra (decisão do dono): em posto COM profissional fixa (pro_fixo preenchido),
// a escala valor_diaria carrega o valor da FIXA (mensalista/horista) — não pode
// ser usado como base da reoferta. Nesse caso a base passa a ser o valor de
// FREELANCER pelo motor de diária, na mesma precedência de router_calcular_diaria.js:
//   (1) postos.valor_diaria_base se > 0
//   (2) senão regra pricing_rules tipo='base' com faixa_horas = carga_horaria do posto
//       (fallback: faixa inferior mais próxima; senão faixa máxima)
//   (3) senão 180
// Em posto SEM fixa, mantém escala.valor_diaria (que já é o valor do motor).
//
// As exceções por pro (teste → ajuda_custo; valor_negociado → valor_negociado)
// continuam valendo DEPOIS desta base — aplicadas nos hooks chamadores, sem mudança.

/**
 * @param {Object} params
 * @param {Object} params.posto - registro do posto (pode ser null)
 * @param {Object} params.escala - registro da escala (pode ser null)
 * @returns {{valor: number, origem: string}} valor base e origem (para log/regra)
 */
function calcularValorBaseReoferta(params) {
  const posto = params && params.posto
  const escala = params && params.escala

  const proFixoId = posto ? posto.getString('pro_fixo') : ''
  const valorEscala = escala ? escala.getFloat('valor_diaria') || 0 : 0

  // Posto SEM fixa: comportamento atual intacto — valor da escala é a base.
  if (!proFixoId) {
    return {
      valor: valorEscala || 180,
      origem: valorEscala ? 'escala.valor_diaria (posto sem fixa)' : 'fallback 180',
    }
  }

  // Posto COM fixa: usar o motor de freelancer (mesma precedência do router_calcular_diaria).
  const cargaHoraria = posto.getInt('carga_horaria') || 8
  const postoValorDiariaBase = posto.getFloat('valor_diaria_base') || 0

  if (postoValorDiariaBase > 0) {
    return {
      valor: postoValorDiariaBase,
      origem: 'motor de diária (diária base do posto ' + cargaHoraria + 'h)',
    }
  }

  // Regra tipo='base' da pricing_rules: faixa exata → inferior mais próxima → máxima.
  try {
    const baseRules = $app.findRecordsByFilter(
      'pricing_rules',
      "tipo = 'base'",
      'faixa_horas',
      50,
      0,
    )
    if (baseRules && baseRules.length > 0) {
      let exact = null
      let lower = null
      let maxRule = baseRules[0]

      for (let i = 0; i < baseRules.length; i++) {
        const r = baseRules[i]
        const h = r.getInt('faixa_horas')
        if (h === cargaHoraria) {
          exact = r
          break
        }
        if (h < cargaHoraria && (!lower || h > lower.getInt('faixa_horas'))) {
          lower = r
        }
        if (h > maxRule.getInt('faixa_horas')) {
          maxRule = r
        }
      }

      const chosen = exact || lower || maxRule
      if (chosen) {
        return {
          valor: chosen.getFloat('valor'),
          origem: 'motor de diária (tabela base ' + chosen.getInt('faixa_horas') + 'h)',
        }
      }
    }
  } catch (_) {}

  return { valor: 180, origem: 'motor de diária (fallback 180)' }
}

const valorReofertaExports = {
  calcularValorBaseReoferta: calcularValorBaseReoferta,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = valorReofertaExports
}
if (typeof globalThis !== 'undefined') {
  globalThis.ValorReoferta = valorReofertaExports
}
