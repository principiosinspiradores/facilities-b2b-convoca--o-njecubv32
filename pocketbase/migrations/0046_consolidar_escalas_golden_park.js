migrate(
  (app) => {
    // Migration 0046: Consolidação cirúrgica das escalas duplicadas do Hotel Golden Park (posto: 1hzlphqs9udyhjc)
    // Criadas em 07/10 antes da trava anti-duplicação.
    // Idempotente: se executada em banco vazio ou já migrado, não falha (no-op).

    app.runInTransaction((txApp) => {
      // 1. Mapeamento dos dias com escala mantida e escalas excedentes
      const consolidacao = [
        {
          dia: '09/10/2026',
          mantidaId: '3mafcggt9qwcmob',
          excedentesIds: [
            'ce0ya2irydm3uto',
            'rjjmi2xf59p84dn',
            'bwobbzok4i8lvyc',
            'j6g7xejqdt4at0c',
          ],
        },
        {
          dia: '10/10/2026',
          mantidaId: '7c18etw3hppfp3z',
          excedentesIds: [
            'mpzeswpylr6oe9v',
            '21t0cbn02xyj05p',
            '77ag0aafbh2jk4m',
            'sbw1auollaxos4e',
          ],
        },
        {
          dia: '11/10/2026',
          mantidaId: 'd70n21kdmj5uojx',
          excedentesIds: [
            '1ir11zjsisw7uxw',
            'd79n685vctpjk0h',
            'bvnmias9out406a',
            'r4psln1cmj2nv2t',
          ],
        },
      ]

      // Passo 1: Reapontar registros filhos das escalas excedentes para a escala mantida
      // Coleções com campo `escala`: convocacoes, payouts, pontos, mensagens_conversas, historico_escalas
      const colecoesFilhas = [
        'convocacoes',
        'payouts',
        'pontos',
        'mensagens_conversas',
        'historico_escalas',
      ]

      for (let c = 0; c < consolidacao.length; c++) {
        const item = consolidacao[c]
        const mantidaId = item.mantidaId
        const excedentes = item.excedentesIds

        for (let e = 0; e < excedentes.length; e++) {
          const excId = excedentes[e]

          for (let k = 0; k < colecoesFilhas.length; k++) {
            const colName = colecoesFilhas[k]
            let records = []
            try {
              records = txApp.findRecordsByFilter(
                colName,
                `escala = '${excId}'`,
                'created',
                5000,
                0,
              )
            } catch (err) {
              console.log(
                `[MIGRATION_0046] Aviso ao consultar ${colName} para escala ${excId}:`,
                err,
              )
              records = []
            }

            for (let r = 0; r < records.length; r++) {
              const rec = records[r]
              rec.set('escala', mantidaId)
              txApp.save(rec)
              console.log(
                `[MIGRATION_0046] ${colName} ${rec.id} reapontado de ${excId} para ${mantidaId}`,
              )
            }
          }
        }
      }

      // Coleção atestados não possui campo direto `escala` (possui `convocacao`),
      // mas se houver qualquer atestado com campo escala em versão de schema legada/futura, verificamos defensivamente:
      if (txApp.hasTable('atestados')) {
        for (let c = 0; c < consolidacao.length; c++) {
          const item = consolidacao[c]
          const mantidaId = item.mantidaId
          for (let e = 0; e < item.excedentesIds.length; e++) {
            const excId = item.excedentesIds[e]
            try {
              const atestRecs = txApp.findRecordsByFilter(
                'atestados',
                `escala = '${excId}'`,
                'created',
                100,
                0,
              )
              for (let a = 0; a < atestRecs.length; a++) {
                const rec = atestRecs[a]
                rec.set('escala', mantidaId)
                txApp.save(rec)
              }
            } catch (_) {
              // Campo 'escala' não existe em atestados (schema padrão é via convocacao), segue normalmente
            }
          }
        }
      }

      // Passo 2: Convocações PENDENTES vinculadas às gêmeas antigas -> status 'cancelada', regra_aplicada 'Cancelada na consolidação de escalas duplicadas (data já passada)'
      // IDs: wtszq3qwqcna7u5, adcwpu47ozg7m5u, xts1ri7gw8cjg2v, c1b675ptypl2y7f, 0zf1cra7v48edjb
      const convocacoesPendentesIds = [
        'wtszq3qwqcna7u5',
        'adcwpu47ozg7m5u',
        'xts1ri7gw8cjg2v',
        'c1b675ptypl2y7f',
        '0zf1cra7v48edjb',
      ]

      for (let i = 0; i < convocacoesPendentesIds.length; i++) {
        const cId = convocacoesPendentesIds[i]
        try {
          const conv = txApp.findRecordById('convocacoes', cId)
          if (conv.getString('status') === 'pendente') {
            conv.set('status', 'cancelada')
            conv.set(
              'regra_aplicada',
              'Cancelada na consolidação de escalas duplicadas (data já passada)',
            )
            txApp.save(conv)
            console.log(`[MIGRATION_0046] Convocação ${cId} cancelada na consolidação.`)
          }
        } catch (err) {
          console.log(`[MIGRATION_0046] Convocação ${cId} não encontrada:`, err)
        }
      }

      // Passo 3: As 12 escalas excedentes -> status 'cancelada', observacao 'Consolidação de escalas duplicadas do posto (criadas em 07/10 antes da trava anti-duplicação)'
      const todasExcedentesIds = [
        'ce0ya2irydm3uto',
        'rjjmi2xf59p84dn',
        'bwobbzok4i8lvyc',
        'j6g7xejqdt4at0c',
        'mpzeswpylr6oe9v',
        '21t0cbn02xyj05p',
        '77ag0aafbh2jk4m',
        'sbw1auollaxos4e',
        '1ir11zjsisw7uxw',
        'd79n685vctpjk0h',
        'bvnmias9out406a',
        'r4psln1cmj2nv2t',
      ]

      for (let i = 0; i < todasExcedentesIds.length; i++) {
        const escId = todasExcedentesIds[i]
        try {
          const esc = txApp.findRecordById('escalas', escId)
          esc.set('status', 'cancelada')
          esc.set(
            'observacao',
            'Consolidação de escalas duplicadas do posto (criadas em 07/10 antes da trava anti-duplicação)',
          )
          txApp.save(esc)
          console.log(`[MIGRATION_0046] Escala excedente ${escId} cancelada.`)
        } catch (err) {
          console.log(`[MIGRATION_0046] Escala excedente ${escId} não encontrada:`, err)
        }
      }

      // Passo 4: As 3 escalas mantidas -> status 'aceita', turno 07:30–17:00, vagas=5 (já está), valor_diaria conforme hoje (140/150/150).
      const mantidasConfig = [
        { id: '3mafcggt9qwcmob', valor: 140 },
        { id: '7c18etw3hppfp3z', valor: 150 },
        { id: 'd70n21kdmj5uojx', valor: 150 },
      ]

      for (let i = 0; i < mantidasConfig.length; i++) {
        const item = mantidasConfig[i]
        try {
          const esc = txApp.findRecordById('escalas', item.id)
          esc.set('status', 'aceita')
          esc.set('turno_inicio', '07:30')
          esc.set('turno_fim', '17:00')
          esc.set('vagas', 5)
          esc.set('valor_diaria', item.valor)
          txApp.save(esc)
          console.log(
            `[MIGRATION_0046] Escala mantida ${item.id} atualizada para status='aceita', vagas=5, valor=${item.valor}.`,
          )
        } catch (err) {
          console.log(`[MIGRATION_0046] Escala mantida ${item.id} não encontrada:`, err)
        }
      }
    })
  },
  (app) => {
    // Revert opcional
  },
)
