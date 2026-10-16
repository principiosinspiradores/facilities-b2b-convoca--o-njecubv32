migrate(
  (app) => {
    // Migration 0047: Padronização do Golden Park no modelo 1 escala por vaga (igual Park Tower)
    // + Limpeza cirúrgica do aceite duplicado de 11/10
    // Somente posto 1hzlphqs9udyhjc (Hotel Golden Park)
    // Idempotente: se executada em banco vazio ou já migrado, no-op seguro.

    app.runInTransaction((txApp) => {
      const POSTO_GOLDEN_PARK = '1hzlphqs9udyhjc'

      // =========================================================================
      // PARTE 1 - Item 1: Pré-limpeza do fantasma (11/10)
      // =========================================================================
      // Na escala d70n21kdmj5uojx (11/10), o pro b56by08k77arv7m tem duas convocações aceitas:
      // - q4jk7w8s9b0gklx (segunda aceitação) -> cancelar com regra_aplicada 'Aceite duplicado bloqueado pela trava'
      // - nt0b3r5qn6dy2au (primeira aceitação) -> mantida como aceita
      // Payouts de 150:
      // - w4j97nd9s1l5737 (mais recente) -> cancelar (status: 'cancelado') - sem multa, sem evento punitivo
      // - ogci2ngarxln0f7 -> permanece retido, intocado
      try {
        const convFantasma = txApp.findRecordById('convocacoes', 'q4jk7w8s9b0gklx')
        if (convFantasma && convFantasma.getString('status') === 'aceita') {
          convFantasma.set('status', 'cancelada')
          convFantasma.set('regra_aplicada', 'Aceite duplicado bloqueado pela trava')
          txApp.save(convFantasma)
          console.log('[MIGRATION_0047] Convocação fantasma q4jk7w8s9b0gklx cancelada com sucesso.')
        }
      } catch (err) {
        console.log(
          '[MIGRATION_0047] Convocação q4jk7w8s9b0gklx não encontrada ou já tratada:',
          err,
        )
      }

      try {
        const payoutDuplicado = txApp.findRecordById('payouts', 'w4j97nd9s1l5737')
        if (payoutDuplicado && payoutDuplicado.getString('status') === 'retido') {
          payoutDuplicado.set('status', 'cancelado')
          txApp.save(payoutDuplicado)
          console.log('[MIGRATION_0047] Payout duplicado w4j97nd9s1l5737 cancelado com sucesso.')
        }
      } catch (err) {
        console.log('[MIGRATION_0047] Payout w4j97nd9s1l5737 não encontrado ou já tratado:', err)
      }

      // =========================================================================
      // PARTE 1 - Item 2: Divisão em 1 vaga por registro para as 7 escalas
      // =========================================================================
      // 7 escalas não canceladas do Golden Park:
      // 09/10: 3mafcggt9qwcmob
      // 10/10: 7c18etw3hppfp3z
      // 11/10: d70n21kdmj5uojx
      // 14/10: kr3t4dcxk8b05ml
      // 15/10: iand75v2hdtnl21
      // 16/10: auvc63q2dl1yxbp
      // 17/10: 3oraalaysodgj9s

      const escalasConfig = [
        {
          id: '3mafcggt9qwcmob',
          dataDia: '2026-10-09',
          passada: true,
          // Mantida no original: primeira aceita 4biyksd7px0rfnh (pro rjzahqub2ngea3c)
          aceitaOriginalId: '4biyksd7px0rfnh',
          // Novas a criar (4 vagas novas para somar 5 vagas):
          novas: [
            // vaga 2: aceita fwhef1psu72nyga (pro b56by08k77arv7m)
            { tipo: 'convocacao', convId: 'fwhef1psu72nyga', statusEscala: 'aceita' },
            // vaga 3: aceita 8s8bltvh69lrv6v (pro e1idzk8kslnisju)
            { tipo: 'convocacao', convId: '8s8bltvh69lrv6v', statusEscala: 'aceita' },
            // vaga 4: recusada ezsrsvbxazxtzae (pro k98lry4o11dbe13)
            { tipo: 'convocacao', convId: 'ezsrsvbxazxtzae', statusEscala: 'concluida' },
            // vaga 5: vazia
            { tipo: 'vazia', statusEscala: 'concluida' },
          ],
        },
        {
          id: '7c18etw3hppfp3z',
          dataDia: '2026-10-10',
          passada: true,
          // Mantida no original: primeira aceita mv1i2ytlqgl4g1m (pro b56by08k77arv7m)
          aceitaOriginalId: 'mv1i2ytlqgl4g1m',
          novas: [
            // vaga 2: aceita hllmo4ya86mibpf (pro 5o6e9bxem5iworn)
            { tipo: 'convocacao', convId: 'hllmo4ya86mibpf', statusEscala: 'aceita' },
            // vaga 3: aceita 6j1ggajb0wbml1p (pro rjzahqub2ngea3c)
            { tipo: 'convocacao', convId: '6j1ggajb0wbml1p', statusEscala: 'aceita' },
            // vaga 4: aceita zvt6ktz988e4b0k (pro 86vze5wgmxet602)
            { tipo: 'convocacao', convId: 'zvt6ktz988e4b0k', statusEscala: 'aceita' },
            // vaga 5: aceita 5k1nk1ynzv7uf5y (pro srawvnlkgc0yq62)
            { tipo: 'convocacao', convId: '5k1nk1ynzv7uf5y', statusEscala: 'aceita' },
          ],
        },
        {
          id: 'd70n21kdmj5uojx',
          dataDia: '2026-10-11',
          passada: true,
          // Mantida no original: aceita nt0b3r5qn6dy2au (pro b56by08k77arv7m)
          aceitaOriginalId: 'nt0b3r5qn6dy2au',
          novas: [
            // 4 vagas vazias
            { tipo: 'vazia', statusEscala: 'concluida' },
            { tipo: 'vazia', statusEscala: 'concluida' },
            { tipo: 'vazia', statusEscala: 'concluida' },
            { tipo: 'vazia', statusEscala: 'concluida' },
          ],
        },
        {
          id: 'kr3t4dcxk8b05ml',
          dataDia: '2026-10-14',
          passada: true,
          // Mantida no original: primeira aceita gi3bh1hihb4jcfs (pro srawvnlkgc0yq62)
          aceitaOriginalId: 'gi3bh1hihb4jcfs',
          novas: [
            // vaga 2: aceita 4x1rcffzp09ckcn (pro rjzahqub2ngea3c)
            { tipo: 'convocacao', convId: '4x1rcffzp09ckcn', statusEscala: 'aceita' },
            // vaga 3: aceita x0fqf1vnulufz1e (pro e1idzk8kslnisju)
            { tipo: 'convocacao', convId: 'x0fqf1vnulufz1e', statusEscala: 'aceita' },
            // vaga 4: pendente jfmhu1v3pg8d7qc (pro k6a2ldhxpzhzc3j)
            { tipo: 'convocacao', convId: 'jfmhu1v3pg8d7qc', statusEscala: 'convocada' },
            // vaga 5: pendente ysa7hafboecj1cl (pro 7clb5qpvyspaup9)
            { tipo: 'convocacao', convId: 'ysa7hafboecj1cl', statusEscala: 'convocada' },
          ],
        },
        {
          id: 'iand75v2hdtnl21',
          dataDia: '2026-10-15',
          passada: true,
          // Mantida no original: primeira aceita 2v0i9wqsi7yiag7 (pro rjzahqub2ngea3c)
          aceitaOriginalId: '2v0i9wqsi7yiag7',
          novas: [
            // vaga 2: aceita ubv1fqojhwljef5 (pro srawvnlkgc0yq62)
            { tipo: 'convocacao', convId: 'ubv1fqojhwljef5', statusEscala: 'aceita' },
            // vaga 3: aceita 5qo2bz95nfsnx0o (pro e1idzk8kslnisju)
            { tipo: 'convocacao', convId: '5qo2bz95nfsnx0o', statusEscala: 'aceita' },
            // vaga 4: aceita bh4vd7zknlptzbc (pro b56by08k77arv7m)
            { tipo: 'convocacao', convId: 'bh4vd7zknlptzbc', statusEscala: 'aceita' },
            // vaga 5: pendente us289q4ovm4tl3d (pro 7clb5qpvyspaup9)
            { tipo: 'convocacao', convId: 'us289q4ovm4tl3d', statusEscala: 'convocada' },
          ],
        },
        {
          id: 'auvc63q2dl1yxbp',
          dataDia: '2026-10-16',
          passada: true,
          // Mantida no original: primeira aceita d9ug4ndrx3eulau (pro srawvnlkgc0yq62)
          aceitaOriginalId: 'd9ug4ndrx3eulau',
          novas: [
            // vaga 2: aceita 1ohag81946hu5c1 (pro e1idzk8kslnisju)
            { tipo: 'convocacao', convId: '1ohag81946hu5c1', statusEscala: 'aceita' },
            // vaga 3: aceita gyg5hgenq4asb1r (pro evz3d1ifxrpohxq)
            { tipo: 'convocacao', convId: 'gyg5hgenq4asb1r', statusEscala: 'aceita' },
            // vaga 4: pendente yn2fuxrp3to56f2 (pro 92mi7c96xzwt1jn)
            { tipo: 'convocacao', convId: 'yn2fuxrp3to56f2', statusEscala: 'convocada' },
            // vaga 5: vazia
            { tipo: 'vazia', statusEscala: 'concluida' },
          ],
        },
        {
          id: '3oraalaysodgj9s',
          dataDia: '2026-10-17',
          passada: false,
          // Mantida no original: vazia
          aceitaOriginalId: null,
          novas: [
            // 4 vagas vazias abertas
            { tipo: 'vazia', statusEscala: 'aberta' },
            { tipo: 'vazia', statusEscala: 'aberta' },
            { tipo: 'vazia', statusEscala: 'aberta' },
            { tipo: 'vazia', statusEscala: 'aberta' },
          ],
        },
      ]

      const escalasCollection = txApp.findCollectionByNameOrId('escalas')

      for (let i = 0; i < escalasConfig.length; i++) {
        const item = escalasConfig[i]
        let originalEscala = null
        try {
          originalEscala = txApp.findRecordById('escalas', item.id)
        } catch (_) {
          console.log(`[MIGRATION_0047] Escala original ${item.id} não encontrada. Pulando.`)
          continue
        }

        if (originalEscala.getString('posto') !== POSTO_GOLDEN_PARK) {
          console.log(
            `[MIGRATION_0047] Escala ${item.id} não pertence ao Golden Park (${originalEscala.getString('posto')}). Pulando.`,
          )
          continue
        }

        // Idempotência: se já tem vagas = 1 e já existem outras escalas não canceladas para este mesmo posto/data/turno
        // com observacao 'Criada na padronização 1 vaga por escala', consideramos já migrado.
        const jaMigradas = txApp.findRecordsByFilter(
          'escalas',
          `posto = '${POSTO_GOLDEN_PARK}' && data ~ '${item.dataDia}' && observacao ~ 'padronização 1 vaga por escala' && status != 'cancelada'`,
          'created',
          10,
          0,
        )

        if (jaMigradas && jaMigradas.length >= item.novas.length) {
          console.log(
            `[MIGRATION_0047] Escala ${item.id} (${item.dataDia}) já possui registros desmembrados. Garantindo vagas=1 no original.`,
          )
          if (originalEscala.getInt('vagas') !== 1) {
            originalEscala.set('vagas', 1)
            txApp.save(originalEscala)
          }
          continue
        }

        const postoId = originalEscala.getString('posto')
        const dataIso = originalEscala.getString('data')
        const turnoInicio = originalEscala.getString('turno_inicio')
        const turnoFim = originalEscala.getString('turno_fim')
        const valorDiaria = originalEscala.getFloat('valor_diaria')

        // 1. Atualizar a escala original para vagas = 1
        originalEscala.set('vagas', 1)
        if (item.aceitaOriginalId) {
          originalEscala.set('status', 'aceita')
        } else if (item.passada) {
          originalEscala.set('status', 'concluida')
        } else {
          originalEscala.set('status', 'aberta')
        }
        txApp.save(originalEscala)
        console.log(
          `[MIGRATION_0047] Escala original ${item.id} atualizada: vagas=1, status=${originalEscala.getString('status')}.`,
        )

        // 2. Criar as novas escalas filhas (vagas=1)
        for (let n = 0; n < item.novas.length; n++) {
          const novaDef = item.novas[n]

          const novaEscala = new Record(escalasCollection)
          novaEscala.set('posto', postoId)
          novaEscala.set('data', dataIso)
          novaEscala.set('turno_inicio', turnoInicio)
          novaEscala.set('turno_fim', turnoFim)
          novaEscala.set('vagas', 1)
          novaEscala.set('valor_diaria', valorDiaria)
          novaEscala.set('multa_aplicada', false)
          novaEscala.set('status', novaDef.statusEscala)
          novaEscala.set('observacao', 'Criada na padronização 1 vaga por escala')
          txApp.save(novaEscala)

          const novaEscalaId = novaEscala.id
          console.log(
            `[MIGRATION_0047] Nova escala criada: ${novaEscalaId} para ${item.dataDia} (${n + 2}/5), status=${novaDef.statusEscala}.`,
          )

          // 3. Se a vaga carrega uma convocação, reapontar convocação + payouts + pontos + conversas
          if (novaDef.tipo === 'convocacao' && novaDef.convId) {
            let convRec = null
            try {
              convRec = txApp.findRecordById('convocacoes', novaDef.convId)
            } catch (errConv) {
              console.log(`[MIGRATION_0047] Convocação ${novaDef.convId} não encontrada:`, errConv)
            }

            if (convRec) {
              const proId = convRec.getString('pro')
              const convStatus = convRec.getString('status')

              // Reapontar convocação para a nova escala
              convRec.set('escala', novaEscalaId)
              txApp.save(convRec)
              console.log(
                `[MIGRATION_0047] Convocação ${convRec.id} (pro ${proId}) movida da escala ${item.id} para ${novaEscalaId}.`,
              )

              // Reapontar Payouts vinculados a esse pro na escala original (exceto se for cancelado ou de outro turno)
              // "cada payout e cada ponto (coleção pontos) cujo pro tenha aceitação movida para uma escala nova -> reapontar o campo escala para a escala nova correspondente"
              if (convStatus === 'aceita' && proId) {
                try {
                  const payoutsDoPro = txApp.findRecordsByFilter(
                    'payouts',
                    `escala = '${item.id}' && pro = '${proId}' && status != 'cancelado'`,
                    'created',
                    50,
                    0,
                  )
                  for (let p = 0; p < payoutsDoPro.length; p++) {
                    const pay = payoutsDoPro[p]
                    pay.set('escala', novaEscalaId)
                    txApp.save(pay)
                    console.log(
                      `[MIGRATION_0047] Payout ${pay.id} do pro ${proId} reapontado para nova escala ${novaEscalaId}.`,
                    )
                  }
                } catch (errPay) {
                  console.log(
                    `[MIGRATION_0047] Erro ao buscar payouts para reapontamento (escala ${item.id}, pro ${proId}):`,
                    errPay,
                  )
                }

                // Reapontar Pontos vinculados a esse pro na escala original
                try {
                  const pontosDoPro = txApp.findRecordsByFilter(
                    'pontos',
                    `escala = '${item.id}' && pro = '${proId}'`,
                    'created',
                    50,
                    0,
                  )
                  for (let pt = 0; pt < pontosDoPro.length; pt++) {
                    const pto = pontosDoPro[pt]
                    pto.set('escala', novaEscalaId)
                    txApp.save(pto)
                    console.log(
                      `[MIGRATION_0047] Ponto ${pto.id} do pro ${proId} reapontado para nova escala ${novaEscalaId}.`,
                    )
                  }
                } catch (errPto) {
                  console.log(
                    `[MIGRATION_0047] Erro ao buscar pontos para reapontamento (escala ${item.id}, pro ${proId}):`,
                    errPto,
                  )
                }
              }

              // Reapontar mensagens_conversas contextuais vinculadas a essa convocação ou (escala original + pro)
              try {
                const conversas = txApp.findRecordsByFilter(
                  'mensagens_conversas',
                  `convocacao = '${convRec.id}' || (escala = '${item.id}' && pro = '${proId}')`,
                  'created',
                  50,
                  0,
                )
                for (let m = 0; m < conversas.length; m++) {
                  const cv = conversas[m]
                  cv.set('escala', novaEscalaId)
                  txApp.save(cv)
                  console.log(
                    `[MIGRATION_0047] Conversa ${cv.id} reapontada para nova escala ${novaEscalaId}.`,
                  )
                }
              } catch (errCv) {
                console.log(
                  `[MIGRATION_0047] Erro ao buscar mensagens_conversas para reapontamento (convocacao ${convRec.id}):`,
                  errCv,
                )
              }
            }
          }
        }
      }
    })
  },
  (app) => {
    // Revert opcional
  },
)
