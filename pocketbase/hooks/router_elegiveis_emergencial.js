// pocketbase/hooks/router_elegiveis_emergencial.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Endpoint para buscar profissionais elegíveis para convocação emergencial ou reoferta.
 * Reuso direto de pocketbase/hooks/lib_elegibilidade_reoferta.js (buscarProsElegiveisReoferta).
 * Rota: GET /backend/v1/facilities/pros-elegiveis-escala/{escalaId}
 *
 * Regras:
 * 1. Requer autenticação (role admin ou empresa).
 * 2. Carrega escala e posto.
 * 3. Chama ElegibilidadeReoferta.buscarProsElegiveisReoferta({ escala, posto, now }).
 * 4. Retorna lista sanitizada com id, name, email, phone, status, avatar, funcoes, ajuda_custo, valor_negociado.
 */

routerAdd('GET', '/backend/v1/facilities/pros-elegiveis-escala/{escalaId}', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Não autorizado. Faça login como gestor.' })
  }

  const role = authRecord.getString('role')
  if (role !== 'admin' && role !== 'empresa') {
    return e.json(403, {
      message: 'Apenas administradores e empresas podem consultar profissionais elegíveis.',
    })
  }

  const escalaId = e.request.pathValue('escalaId')
  if (!escalaId) {
    return e.json(400, { message: 'ID da escala é obrigatório.' })
  }

  let escala
  try {
    escala = $app.findRecordById('escalas', escalaId)
  } catch (_) {
    return e.json(404, { message: 'Escala não encontrada.' })
  }

  let posto = null
  const postoId = escala.getString('posto')
  if (postoId) {
    try {
      posto = $app.findRecordById('postos', postoId)
    } catch (_) {}
  }

  const now = new Date()
  let elegiveis = []

  if (
    typeof ElegibilidadeReoferta !== 'undefined' &&
    ElegibilidadeReoferta.buscarProsElegiveisReoferta
  ) {
    elegiveis = ElegibilidadeReoferta.buscarProsElegiveisReoferta({
      escala: escala,
      posto: posto,
      now: now,
    })
  }

  const resultado = []
  for (let i = 0; i < elegiveis.length; i++) {
    const p = elegiveis[i]
    let funcoesResolvidas = []
    if (typeof ElegibilidadeReoferta !== 'undefined' && ElegibilidadeReoferta.extrairFuncoesPro) {
      funcoesResolvidas = ElegibilidadeReoferta.extrairFuncoesPro(p)
    }

    resultado.push({
      id: p.id,
      name: p.getString('name'),
      email: p.email(),
      phone: p.getString('phone'),
      status: p.getString('status'),
      avatar: p.getString('avatar'),
      funcoes: funcoesResolvidas,
      ajuda_custo: p.getFloat('ajuda_custo') || 0,
      valor_negociado: p.getFloat('valor_negociado') || 0,
    })
  }

  return e.json(200, {
    escala_id: escalaId,
    posto_nome: posto ? posto.getString('nome') : '',
    funcao_posto: posto ? posto.getString('funcao') : '',
    total: resultado.length,
    items: resultado,
  })
})
