migrate(
  (app) => {
    // 1. Atualizar API rules das coleções financeiras / exclusivas do Admin
    // Payouts: Pro pode ver/atualizar o seu; Admin tem acesso total; EMPRESA NÃO TEM ACESSO
    const payouts = app.findCollectionByNameOrId('payouts')
    payouts.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    payouts.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    payouts.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'pro')"
    payouts.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    payouts.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(payouts)

    // Payment Events: Apenas Admin (exclusivo para rastreio financeiro e de liquidação)
    const paymentEvents = app.findCollectionByNameOrId('payment_events')
    paymentEvents.listRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paymentEvents.viewRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paymentEvents.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paymentEvents.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    paymentEvents.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(paymentEvents)

    // Disputas: Pro (as suas) e Admin (mediação). Empresa não arbitra disputas de escrow
    const disputas = app.findCollectionByNameOrId('disputas')
    disputas.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    disputas.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    disputas.createRule =
      "@request.auth.id != '' && (pro = @request.auth.id || @request.auth.role = 'admin')"
    disputas.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    disputas.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(disputas)

    // 2. Atualizar permissões de users para garantir que empresa possa aprovar gate e bloquear/desbloquear pros
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.id = id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || @request.auth.id = id)"
    users.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.role = 'empresa' && role = 'pro') || @request.auth.id = id)"
    users.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(users)

    // 3. Cadastrar novos usuários de exemplo com perfil "empresa" para suportar múltiplos logins simultâneos (RH e Gestão Operacional)
    // Conforme enunciado: senha Skip@Pass
    const seedEmpresas = [
      {
        email: 'rh@facilitiespro.com.br',
        name: 'Mariana Costa (RH Facilities)',
      },
      {
        email: 'operacoes@facilitiespro.com.br',
        name: 'Rodrigo Gestor (Operações Facilities)',
      },
    ]

    for (const emp of seedEmpresas) {
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', emp.email)
      } catch (_) {
        const rec = new Record(users)
        rec.setEmail(emp.email)
        rec.setPassword('Skip@Pass')
        rec.setVerified(true)
        rec.set('name', emp.name)
        rec.set('role', 'empresa')
        rec.set('status', 'ativo')
        app.save(rec)
      }
    }
  },
  (app) => {
    // down migration
  },
)
