migrate(
  (app) => {
    // LIMPEZA CIRÚRGICA DA BASE DE DADOS PARA PRODUÇÃO
    // MANTER INTACTO:
    // - admin (janluyfranca@gmail.com e qualquer usuário com role='admin')
    // - settings (white label, logo, cores, regras de escrow/multa)
    // - pricing_rules (tabela base 4h/6h/8h, regras de treino/fds/feriado)
    // - holidays (feriados cadastrados)
    // - funcoes (catálogo de funções operacionais)
    //
    // APAGAR (dados de teste):
    // 1. Dependências e vínculos: pontos, payouts, payment_events, disputas, conta_pix,
    //    mensagens_mensagens, mensagens_conversas, historico_escalas, convocacoes
    // 2. Operações de teste: escalas, postos
    // 3. Usuários de teste: role='pro' e role='empresa'
    // 4. Qualquer órfão residual nessas coleções

    // Ordem estrita de deleção via SQL / app.db() para respeitar integridade referencial:

    // 1. Dependências de pagamentos e disputas
    try {
      app.db().newQuery('DELETE FROM payment_events').execute()
    } catch (e) {
      console.log('Erro ao limpar payment_events:', e)
    }

    try {
      app.db().newQuery('DELETE FROM disputas').execute()
    } catch (e) {
      console.log('Erro ao limpar disputas:', e)
    }

    try {
      app.db().newQuery('DELETE FROM payouts').execute()
    } catch (e) {
      console.log('Erro ao limpar payouts:', e)
    }

    // 2. Dependências de pontos e conta_pix
    try {
      app.db().newQuery('DELETE FROM pontos').execute()
    } catch (e) {
      console.log('Erro ao limpar pontos:', e)
    }

    try {
      app.db().newQuery('DELETE FROM conta_pix').execute()
    } catch (e) {
      console.log('Erro ao limpar conta_pix:', e)
    }

    // 3. Dependências de comunicação e histórico
    try {
      app.db().newQuery('DELETE FROM mensagens_mensagens').execute()
    } catch (e) {
      console.log('Erro ao limpar mensagens_mensagens:', e)
    }

    try {
      app.db().newQuery('DELETE FROM mensagens_conversas').execute()
    } catch (e) {
      console.log('Erro ao limpar mensagens_conversas:', e)
    }

    try {
      app.db().newQuery('DELETE FROM historico_escalas').execute()
    } catch (e) {
      console.log('Erro ao limpar historico_escalas:', e)
    }

    // 4. Convocacões
    try {
      app.db().newQuery('DELETE FROM convocacoes').execute()
    } catch (e) {
      console.log('Erro ao limpar convocacoes:', e)
    }

    // 5. Escalas
    try {
      app.db().newQuery('DELETE FROM escalas').execute()
    } catch (e) {
      console.log('Erro ao limpar escalas:', e)
    }

    // 6. Postos
    // Postos de teste vinculados em pricing_rules devem ter sua referência removida antes de apagar o posto
    try {
      app.db().newQuery("UPDATE pricing_rules SET posto = '' WHERE posto != ''").execute()
    } catch (e) {
      console.log('Erro ao desvincular postos em pricing_rules:', e)
    }

    try {
      app.db().newQuery('DELETE FROM postos').execute()
    } catch (e) {
      console.log('Erro ao limpar postos:', e)
    }

    // 7. Usuários de teste (role = 'pro' e role = 'empresa')
    // Garantir que NENHUM admin seja removido (janluyfranca@gmail.com e role = 'admin' preservados)
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM users WHERE (role = 'pro' OR role = 'empresa') AND role != 'admin' AND email != 'janluyfranca@gmail.com'",
        )
        .execute()
    } catch (e) {
      console.log('Erro ao limpar usuários teste pro e empresa:', e)
    }

    // 8. Desvincular de funcoes o campo 'criada_por' se apontar para usuário excluído
    try {
      app
        .db()
        .newQuery(
          "UPDATE funcoes SET criada_por = '' WHERE criada_por != '' AND criada_por NOT IN (SELECT id FROM users)",
        )
        .execute()
    } catch (e) {
      console.log('Erro ao limpar criadores órfãos em funcoes:', e)
    }
  },
  (app) => {
    // Operação de limpeza irreversível de dados de teste (sem rollback para testes fictícios)
  },
)
