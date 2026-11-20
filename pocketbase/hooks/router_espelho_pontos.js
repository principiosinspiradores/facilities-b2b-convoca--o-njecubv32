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
 * Performance: cada objeto é montado manualmente com os getters do Record
 * (getString/getBool/getFloat/getDateTime). Objetos JS puros serializam
 * rápido no e.json — o antigo JSON.parse(JSON.stringify(rec)) levava
 * 25–42s na janela de 1 mês (~2000 registros × dezenas de ms no Goja) e
 * ainda bloqueava o JSVM, atrasando consultas simultâneas.
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
  // Fuso America/Sao_Paulo = UTC-3 fixo (sem horário de verão). O JSVM (Goja)
  // não possui o objeto Intl, então calculamos a data de hoje deslocando o
  // timestamp 3h para trás e lendo os getters UTC.
  const agoraSp = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const hojeSp =
    agoraSp.getUTCFullYear() +
    '-' +
    String(agoraSp.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(agoraSp.getUTCDate()).padStart(2, '0')
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

  // Helper: campo date → string no formato armazenado ("YYYY-MM-DD HH:MM:SS.sssZ"),
  // mesmo formato que o JSON round-trip antigo devolvia
  const campoData = (rec, nome) => {
    try {
      const dt = rec.getDateTime(nome)
      return dt ? dt.string() : ''
    } catch (_) {
      return ''
    }
  }

  // Helper: campo json (armazenado como texto) → objeto/valor parseado
  const campoJson = (rec, nome) => {
    const bruto = rec.getString(nome)
    if (!bruto) return null
    try {
      return JSON.parse(bruto)
    } catch (_) {
      return bruto
    }
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

  // 5. Montadores de objetos JS puros — apenas os campos que a tela usa
  const objetoPosto = (rec) => ({
    id: rec.id,
    nome: rec.getString('nome'),
    endereco: campoJson(rec, 'endereco'),
    carga_horaria: rec.getFloat('carga_horaria'),
    raio_geocerca_m: rec.getFloat('raio_geocerca_m'),
    tolerancia_entrada_minutos: rec.getFloat('tolerancia_entrada_minutos'),
    tolerancia_saida_minutos: rec.getFloat('tolerancia_saida_minutos'),
    funcao: rec.getString('funcao'),
  })

  const objetoEscala = (rec) => {
    const obj = {
      id: rec.id,
      posto: rec.getString('posto'),
      data: campoData(rec, 'data'),
      turno_inicio: rec.getString('turno_inicio'),
      turno_fim: rec.getString('turno_fim'),
      status: rec.getString('status'),
      valor_diaria: rec.getFloat('valor_diaria'),
    }
    const postoEscalaRec = postosMapa[rec.getString('posto')]
    if (postoEscalaRec) {
      obj.expand = { posto: objetoPosto(postoEscalaRec) }
    }
    return obj
  }

  const objetoPro = (rec) => ({
    id: rec.id,
    name: rec.getString('name'),
    email: rec.getString('email'),
    funcoes: campoJson(rec, 'funcoes'),
  })

  const objetoPonto = (rec) => ({
    id: rec.id,
    // collectionId/collectionName mantidos: o frontend usa pb.files.getURL(p, p.foto)
    collectionId: rec.collection().id,
    collectionName: rec.collection().name,
    escala: rec.getString('escala'),
    posto: rec.getString('posto'),
    pro: rec.getString('pro'),
    tipo: rec.getString('tipo'),
    timestamp_real: campoData(rec, 'timestamp_real'),
    dentro_raio: rec.getBool('dentro_raio'),
    distancia_metros: rec.getFloat('distancia_metros'),
    foto: rec.getString('foto'),
    gps_precisao_m: rec.getFloat('gps_precisao_m'),
    batido_offline: rec.getBool('batido_offline'),
    sincronizado_em: campoData(rec, 'sincronizado_em'),
    atraso_sincronizacao_minutos: rec.getFloat('atraso_sincronizacao_minutos'),
    fora_janela: rec.getBool('fora_janela'),
    horario_suspeito: rec.getBool('horario_suspeito'),
    ocorrencia: rec.getString('ocorrencia'),
    status_validacao: rec.getString('status_validacao'),
    observacao_gestao: rec.getString('observacao_gestao'),
    tolerancia_aplicada_minutos: rec.getFloat('tolerancia_aplicada_minutos'),
    raio_posto_m: rec.getFloat('raio_posto_m'),
    client_uuid: rec.getString('client_uuid'),
    aviso_sem_convocacao: rec.getBool('aviso_sem_convocacao'),
    created: campoData(rec, 'created'),
    updated: campoData(rec, 'updated'),
  })

  // 6. Monta a resposta no shape do expand
  const resultado = []
  for (let i = 0; i < pontosRecs.length; i++) {
    const p = pontosRecs[i]
    const obj = objetoPonto(p)
    const expand = {}

    const escalaRec = escalasMapa[p.getString('escala')]
    if (escalaRec) expand.escala = objetoEscala(escalaRec)

    const postoRec = postosMapa[p.getString('posto')]
    if (postoRec) expand.posto = objetoPosto(postoRec)

    const proRec = prosMapa[p.getString('pro')]
    if (proRec) expand.pro = objetoPro(proRec)

    if (Object.keys(expand).length > 0) obj.expand = expand
    resultado.push(obj)
  }

  return e.json(200, { pontos: resultado })
})
