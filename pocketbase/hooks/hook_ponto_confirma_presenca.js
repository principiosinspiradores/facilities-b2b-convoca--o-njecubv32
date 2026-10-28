// pocketbase/hooks/hook_ponto_confirma_presenca.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook pós-criação de ponto para confirmação automática de presença.
 *
 * Ao registrar um ponto com tipo='chegada' (qualquer status_validacao: valido, alerta,
 * contestado, aprovado_manual, online ou offline):
 * - Busca em 'convocacoes' registros com status='aceita', mesmo pro e mesma escala do ponto,
 *   onde confirmacao_presenca='nao_confirmada' (ou vazio/nulo por defesa).
 * - Para cada registro encontrado, atualiza:
 *     confirmacao_presenca = 'confirmada'
 *     confirmacao_data = timestamp_real do ponto (ou created se ausente)
 *
 * Regras:
 * - Idempotente: se já estiver 'confirmada' ou 'nao_vai', não faz nada.
 * - Silencioso: sem push, sem e-mail, sem notificação.
 * - Não mexe em status da convocação, multa, reoferta, geocerca, crons ou outras regras.
 * - Ponto de 'saida' não altera nada.
 */

onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  if (!record) return

  const tipo = record.getString('tipo')
  if (tipo !== 'chegada') return

  const proId = record.getString('pro')
  const escalaId = record.getString('escala')

  if (!proId || !escalaId) return

  try {
    // Determinar data da confirmação usando o timestamp_real do ponto
    const timestampReal =
      record.getString('timestamp_real') || record.getString('created') || new Date().toISOString()

    // Buscar convocações aceitas da mesma pro e escala que ainda não foram confirmadas
    const filtro =
      "status = 'aceita' && pro = '" +
      proId +
      "' && escala = '" +
      escalaId +
      "' && (confirmacao_presenca = 'nao_confirmada' || confirmacao_presenca = '' || confirmacao_presenca = null)"

    const convocacoes = $app.findRecordsByFilter('convocacoes', filtro, '-created', 10, 0)

    if (!convocacoes || convocacoes.length === 0) {
      return
    }

    for (let i = 0; i < convocacoes.length; i++) {
      const conv = convocacoes[i]
      const statusPresencaAtual = conv.getString('confirmacao_presenca')

      // Defesa estrita: se já for confirmada ou nao_vai, ignorar
      if (statusPresencaAtual === 'confirmada' || statusPresencaAtual === 'nao_vai') {
        continue
      }

      conv.set('confirmacao_presenca', 'confirmada')
      conv.set('confirmacao_data', timestampReal)
      $app.save(conv)
      console.log(
        `[PONTO_CONFIRMA_PRESENCA] Convocação ${conv.id} (pro=${proId}, escala=${escalaId}) confirmada automaticamente pelo ponto de chegada ${record.id} (${timestampReal}).`,
      )
    }
  } catch (err) {
    console.log('[PONTO_CONFIRMA_PRESENCA] Erro ao confirmar presença pelo ponto:', err)
  }
}, 'pontos')
