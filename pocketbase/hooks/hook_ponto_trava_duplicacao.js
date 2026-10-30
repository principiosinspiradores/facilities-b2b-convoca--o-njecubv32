// pocketbase/hooks/hook_ponto_trava_duplicacao.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Trava anti-duplicação e intervalo mínimo no registro de ponto.
 *
 * 1. Deduplicação por client_uuid:
 *    Se um registro com o mesmo client_uuid já existe, intercepta no request e retorna
 *    o registro existente com HTTP 200 sem criar novo (retry offline idêntico não duplica nem trava).
 *
 * 2. Validações antes de salvar um novo registro de ponto (MESMA pro + MESMA escala + MESMO dia):
 *    (a) chegada quando já existe chegada -> bloquear com mensagem:
 *        "Você já registrou sua chegada hoje para este turno"
 *    (b) saída quando já existe saída -> bloquear com:
 *        "Você já registrou sua saída para este turno"
 *    (c) saída SEM chegada anterior -> bloquear com:
 *        "Registre sua chegada antes da saída"
 *    (d) saída com chegada há MENOS de 10 minutos (ou settings.ponto_intervalo_min_saida_min) -> bloquear com:
 *        "Saída muito próxima da chegada — aguarde alguns minutos"
 *
 * Observações:
 * - Registros offline (batido_offline=true) usam timestamp_real para comparações de tempo.
 * - Tolerância do intervalo mínimo lida de settings (`ponto_intervalo_min_saida_min`), padrão 10.
 */

// Interceptador a nível de requisição: deduplicar se client_uuid idêntico já existe
onRecordCreateRequest((e) => {
  const record = e.record
  if (!record) {
    e.next()
    return
  }

  const clientUuid = record.getString('client_uuid')
  if (clientUuid) {
    try {
      const existente = $app.findFirstRecordByData('pontos', 'client_uuid', clientUuid)
      if (existente && existente.id) {
        console.log(
          `[TRAVA_PONTO] Registro com client_uuid "${clientUuid}" já existe (id=${existente.id}). Retornando sucesso existente sem duplicar.`,
        )
        return e.json(200, existente)
      }
    } catch (_) {
      // Registro não existe ainda com este client_uuid, seguir fluxo normal
    }
  }

  e.next()
}, 'pontos')

// Validação de regras de negócio antes da inserção no banco
onRecordCreate((e) => {
  const record = e.record
  const proId = record.getString('pro')
  const escalaId = record.getString('escala')
  const tipo = record.getString('tipo') // 'chegada' ou 'saida'
  const rawTimestamp = record.getString('timestamp_real') || new Date().toISOString()
  const dataPontoDia = rawTimestamp.slice(0, 10)

  // Se não tem proId ou tipo, deixa as validações de schema atuarem
  if (!proId || !tipo) {
    e.next()
    return
  }

  // Idempotência caso chegue aqui (ex: chamadas internas via $app.save)
  const clientUuid = record.getString('client_uuid')
  if (clientUuid) {
    try {
      const existente = $app.findFirstRecordByData('pontos', 'client_uuid', clientUuid)
      if (existente && existente.id && existente.id !== record.id) {
        console.log(
          `[TRAVA_PONTO] onRecordCreate: client_uuid "${clientUuid}" já existe. Impedindo duplicata.`,
        )
        // Se já existe e veio via internal save, impedir duplicidade lançando erro se não interceptado
        throw new BadRequestError('Registro de ponto já existente com este identificador')
      }
    } catch (errUuid) {
      if (
        errUuid.status === 400 ||
        (errUuid.message && errUuid.message.indexOf('Registro de ponto já existente') >= 0)
      ) {
        throw errUuid
      }
    }
  }

  // Obter intervalo mínimo em minutos (lido de settings.ponto_intervalo_min_saida_min, padrão 10)
  let intervaloMinimoMin = 10
  try {
    const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
    if (settingsList && settingsList.length > 0) {
      const s = settingsList[0]
      const valorConfig = s.getInt('ponto_intervalo_min_saida_min')
      if (valorConfig && valorConfig > 0) {
        intervaloMinimoMin = valorConfig
      }
    }
  } catch (errSettings) {
    console.log('[TRAVA_PONTO] Erro ao consultar settings para intervalo mínimo:', errSettings)
  }

  // Buscar registros da MESMA pro + MESMA escala + MESMO dia
  let filtroBase = `pro = '${proId}' && timestamp_real ~ '${dataPontoDia}'`
  if (escalaId) {
    filtroBase += ` && escala = '${escalaId}'`
  }

  try {
    const pontosExistentes = $app.findRecordsByFilter('pontos', filtroBase, 'timestamp_real', 50, 0)

    let chegadaExistente = null
    let saidaExistente = null

    for (let i = 0; i < pontosExistentes.length; i++) {
      const p = pontosExistentes[i]
      if (p.id === record.id) continue

      const pTipo = p.getString('tipo')
      if (pTipo === 'chegada' && !chegadaExistente) {
        chegadaExistente = p
      } else if (pTipo === 'saida' && !saidaExistente) {
        saidaExistente = p
      }
    }

    if (tipo === 'chegada') {
      // (a) chegada quando já existe chegada -> bloquear com:
      // "Você já registrou sua chegada hoje para este turno"
      if (chegadaExistente) {
        console.log(
          `[TRAVA_PONTO] Bloqueio: Pro ${proId} já registrou chegada hoje para escala ${escalaId}.`,
        )
        throw new BadRequestError('Você já registrou sua chegada hoje para este turno')
      }
    } else if (tipo === 'saida') {
      // (b) saída quando já existe saída -> bloquear com:
      // "Você já registrou sua saída para este turno"
      if (saidaExistente) {
        console.log(
          `[TRAVA_PONTO] Bloqueio: Pro ${proId} já registrou saída hoje para escala ${escalaId}.`,
        )
        throw new BadRequestError('Você já registrou sua saída para este turno')
      }

      // (c) saída SEM chegada anterior:
      // NÃO se aplica a registros com status_validacao='aprovado_manual' (saída manual da gestão).
      // ANTES de bloquear, buscar ponto tipo='chegada' com aviso_sem_convocacao=true, mesmo pro, mesmo posto, mesmo dia.
      // Se existir, PERMITIR a saída (a geocerca já comprovou a presença) e logar no console.
      const statusValidacao = record.getString('status_validacao')
      const isAprovadoManual = statusValidacao === 'aprovado_manual'

      let pontoReferenciaChegada = chegadaExistente

      if (!pontoReferenciaChegada && !isAprovadoManual) {
        // Obter o posto do ponto que está sendo criado ou da escala associada
        let postoId = record.getString('posto')
        if (!postoId && escalaId) {
          try {
            const escRec = $app.findRecordById('escalas', escalaId)
            postoId = escRec.getString('posto')
          } catch (_) {
            /* ignorado */
          }
        }

        if (postoId) {
          try {
            const filtroAlertaGeocerca = `pro = '${proId}' && posto = '${postoId}' && tipo = 'chegada' && aviso_sem_convocacao = true && timestamp_real ~ '${dataPontoDia}'`
            const alertasGeocerca = $app.findRecordsByFilter(
              'pontos',
              filtroAlertaGeocerca,
              'timestamp_real',
              1,
              0,
            )
            if (alertasGeocerca && alertasGeocerca.length > 0) {
              pontoReferenciaChegada = alertasGeocerca[0]
              console.log(
                `[TRAVA_PONTO] Presença comprovada pela geocerca: saída permitida para pro ${proId} no posto ${postoId} com base no alerta ${pontoReferenciaChegada.id} (aviso_sem_convocacao=true).`,
              )
            }
          } catch (errAlerta) {
            console.log('[TRAVA_PONTO] Erro ao consultar alerta de geocerca:', errAlerta)
          }
        }

        if (!pontoReferenciaChegada) {
          console.log(
            `[TRAVA_PONTO] Bloqueio: Pro ${proId} tentou registrar saída sem chegada prévia e sem alerta de geocerca para escala ${escalaId}.`,
          )
          throw new BadRequestError('Registre sua chegada antes da saída')
        }
      }

      // (d) saída com chegada há MENOS de 10 minutos (ou intervaloMinimoMin) -> bloquear com:
      // "Saída muito próxima da chegada — aguarde alguns minutos"
      // Se for aprovado_manual sem ponto de referência de chegada, não aplica trava de intervalo
      if (pontoReferenciaChegada) {
        const timestampChegadaStr =
          pontoReferenciaChegada.getString('timestamp_real') ||
          pontoReferenciaChegada.getString('created') ||
          new Date().toISOString()
        const timestampSaidaStr = rawTimestamp

        const tChegada = new Date(timestampChegadaStr).getTime()
        const tSaida = new Date(timestampSaidaStr).getTime()

        const diffMs = tSaida - tChegada
        const diffMinutos = diffMs / 60000

        if (diffMinutos < intervaloMinimoMin) {
          console.log(
            `[TRAVA_PONTO] Bloqueio: Pro ${proId} tentou saída muito próxima da chegada (${diffMinutos.toFixed(1)} min < ${intervaloMinimoMin} min).`,
          )
          throw new BadRequestError('Saída muito próxima da chegada — aguarde alguns minutos')
        }
      }
    }
  } catch (err) {
    if (
      err.status === 400 ||
      (err.message &&
        (err.message.indexOf('Você já registrou') >= 0 ||
          err.message.indexOf('Registre sua chegada antes da saída') >= 0 ||
          err.message.indexOf('Saída muito próxima da chegada') >= 0 ||
          err.message.indexOf('Registro de ponto já existente') >= 0))
    ) {
      throw err
    }
    console.log('[TRAVA_PONTO] Erro inesperado ao verificar regras de ponto:', err)
  }

  e.next()
}, 'pontos')
