// pocketbase/hooks/router_espelho_pontos.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * GET /backend/v1/facilities/espelho-pontos?inicio=ISO&fim=ISO
 *
 * Espelho de Pontos (empresa/admin): devolve os pontos da janela já com
 * escala, posto da escala, posto direto e pro, resolvidos em LOTE
 * (uma consulta por coleção), sem o `expand` do PocketBase que avaliava
 * rules por registro e levava 15–22s.
 *
 * Shape de resposta: { pontos: [ ...registros com expand ] }
 * - expand.escala (com expand.posto), expand.posto, expand.pro — mesmos campos
 *   que a tela já lê. Relação apagada/inexistente → chave omitida, sem erro.
 * - Janela máxima: 12 meses. Sem parâmetros: mês corrente (fuso SP).
 * - Limite: 2000 pontos por resposta.
 *
 * Escopo do PocketBase (JSVM): cada callback roda isolado — helpers ficam DENTRO do callback.
 */

routerAdd('GET', '/backend/v1/facilities/espelho-pontos', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Não autorizado.' })
  }
  const role = authRecord.getString('role')
  if (role !== 'admin' && role !== 'empresa') {
    return e.json(403, { message: 'Acesso negado.' })
  }

  // Helper: ISO → formato armazenado em timestamp_real ("YYYY-MM-DD HH:MM:SS.sssZ")
  const paraTimestamp = (d) => d.toISOString().replace('T', ' ')

  // Janela: parâmetros ou mês corrente (fuso SP)
  const query = e.request.url.query()
  const agora = new Date()
  const hojeSp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
  const primeiroDiaMesIso = hojeSp.slice(0, 7) + '-01T03:00:00.000Z'

  let inicio = new Date(query.get('inicio') || primeiroDiaMesIso)
  let fim = new Date(query.get('fim') || agora.toISOString())
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return e.json(400, { message: 'Parâmetros inicio/fim inválidos.' })
  }
  if (fim.getTime() < inicio.getTime()) {
    return e.json(400, { message: 'fim anterior ao inicio.' })
  }
  // Limite de 12 meses (≈ 366 dias)
  const limiteMs = 366 * 24 * 60 * 60 * 1000
  if (fim.getTime() - inicio.getTime() > limiteMs) {
    inicio = new Date(fim.getTime() - limiteMs)
  }

  // Helper: busca registros por ids em lotes de 100 (uma consulta por lote)
  const buscarPorIds = (colName, ids) => {
    const mapa = {}
    const lista = Array.from(ids)
    for (let i = 0; i < lista.length; i += 100) {
      const lote = lista.slice(i, i + 100)
      const filtro = lote.map((id) => `id = "${id}"`).join(' || ')
      try {
        const recs = $app.findRecordsByFilter(colName, filtro, 'id', lote.length, 0)
        for (let r = 0; r < recs.length; r++) {
          mapa[recs[r].id] = recs[r]
        }
      } catch (_) {}
    }
    return mapa
  }

  // Helper: model → JSON puro, sem campos sensíveis de autenticação
  const paraJson = (rec) => {
    const obj = JSON.parse(JSON.stringify(rec))
    delete obj.passwordHash
    delete obj.tokenKey
    delete obj.oauth2Accounts
    delete obj.authAlertSent
    delete obj.lastResetSentAt
    delete obj.lastVerificationSentAt
    return obj
  }

  // 1. Pontos da janela, sem expand
  let pontosRecs = []
  try {
    pontosRecs = $app.findRecordsByFilter(
      'pontos',
      `timestamp_real >= "${paraTimestamp(inicio)}" && timestamp_real <= "${paraTimestamp(fim)}"`,
      '-timestamp_real',
      2000,
      0,
    )
  } catch (errPontos) {
    if (errPontos && errPontos.message && errPontos.message.indexOf('no rows') === -1) {
      console.log('[ESPELHO_PONTOS] Erro ao buscar pontos:', errPontos)
    }
    pontosRecs = []
  }

  // 2. Coleta de ids únicos
  const idsEscala = new Set()
  const idsPosto = new Set()
  const idsPro = new Set()
  for (let i = 0; i < pontosRecs.length; i++) {
    const p = pontosRecs[i]
    const escalaId = p.getString('escala')
    const postoId = p.getString('posto')
    const proId = p.getString('pro')
    if (escalaId) idsEscala.add(escalaId)
    if (postoId) idsPosto.add(postoId)
    if (proId) idsPro.add(proId)
  }

  // 3. Lote de escalas; os postos das escalas entram no mesmo lote de postos
  const escalasMapa = buscarPorIds('escalas', idsEscala)
  Object.keys(escalasMapa).forEach((id) => {
    const postoId = escalasMapa[id].getString('posto')
    if (postoId) idsPosto.add(postoId)
  })

  // 4. Lote de postos e de pros
  const postosMapa = buscarPorIds('postos', idsPosto)
  const prosMapa = buscarPorIds('users', idsPro)

  // 5. Monta a resposta no shape do expand
  const resultado = []
  for (let i = 0; i < pontosRecs.length; i++) {
    const p = pontosRecs[i]
    const obj = paraJson(p)
    const expand = {}

    const escalaRec = escalasMapa[p.getString('escala')]
    if (escalaRec) {
      const escalaObj = paraJson(escalaRec)
      const postoEscalaRec = postosMapa[escalaRec.getString('posto')]
      if (postoEscalaRec) {
        escalaObj.expand = { posto: paraJson(postoEscalaRec) }
      }
      expand.escala = escalaObj
    }

    const postoRec = postosMapa[p.getString('posto')]
    if (postoRec) expand.posto = paraJson(postoRec)

    const proRec = prosMapa[p.getString('pro')]
    if (proRec) expand.pro = paraJson(proRec)

    if (Object.keys(expand).length > 0) obj.expand = expand
    resultado.push(obj)
  }

  return e.json(200, { pontos: resultado })
})
