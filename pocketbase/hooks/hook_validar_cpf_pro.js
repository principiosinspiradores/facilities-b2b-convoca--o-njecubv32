// pocketbase/hooks/hook_validar_cpf_pro.js
// Validação e garantia de identidade única por CPF para profissionais (role = 'pro')

// 1. Validação no momento da criação de usuário (onRecordCreate)
onRecordCreate((e) => {
  function validarDigitosCPF(cpfLimpo) {
    if (!cpfLimpo || typeof cpfLimpo !== 'string') return false
    if (cpfLimpo.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false

    let soma = 0
    let resto

    for (let i = 1; i <= 9; i++) {
      soma += parseInt(cpfLimpo.substring(i - 1, i), 10) * (11 - i)
    }
    resto = (soma * 10) % 11
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpfLimpo.substring(9, 10), 10)) return false

    soma = 0
    for (let j = 1; j <= 10; j++) {
      soma += parseInt(cpfLimpo.substring(j - 1, j), 10) * (12 - j)
    }
    resto = (soma * 10) % 11
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpfLimpo.substring(10, 11), 10)) return false

    return true
  }

  function limparDigitosCPF(valor) {
    if (!valor) return ''
    return String(valor).replace(/\D/g, '')
  }

  const record = e.record
  const role = record.getString('role')
  const rawCpf = record.get('cpf') || ''
  const cpfLimpo = limparDigitosCPF(rawCpf)

  if (role === 'pro') {
    if (!cpfLimpo) {
      throw new BadRequestError('O CPF é obrigatório para profissionais parceiros.')
    }

    if (!validarDigitosCPF(cpfLimpo)) {
      throw new BadRequestError('O CPF informado é inválido. Verifique os dígitos verificadores.')
    }

    // Normalizar para 11 dígitos numéricos puros
    record.set('cpf', cpfLimpo)

    // Verificar unicidade global na coleção users (mesmo se suspenso ou bloqueado)
    try {
      const duplicados = $app.findRecordsByFilter(
        'users',
        "cpf = '" + cpfLimpo + "'",
        '-created',
        1,
        0,
      )

      if (duplicados && duplicados.length > 0) {
        const usuarioExistente = duplicados[0]
        const statusExistente = usuarioExistente.getString('status') || 'desconhecido'

        // Notificar administração sobre a tentativa de duplicidade
        try {
          const admins = $app.findRecordsByFilter('users', "role = 'admin'", '-created', 5, 0)

          const proNome = record.getString('name') || 'Profissional'
          const proEmail = record.email() || 'sem email'

          for (let a = 0; a < admins.length; a++) {
            const adminUser = admins[a]
            const conversasCol = $app.findCollectionByNameOrId('mensagens_conversas')
            const conv = new Record(conversasCol)
            conv.set('tipo', 'direta')
            conv.set('pro', usuarioExistente.id)
            conv.set('participantes', [usuarioExistente.id, adminUser.id])
            conv.set('titulo_contexto', 'ALERTA: Tentativa de Recadastro de CPF')
            conv.set(
              'ultima_mensagem_texto',
              `Tentativa de novo cadastro barrada: CPF ${cpfLimpo} já cadastrado em usuário ${usuarioExistente.id} (status: ${statusExistente}). Nome informado: ${proNome} (${proEmail}).`,
            )
            conv.set('ultima_mensagem_data', new Date().toISOString())
            $app.save(conv)

            const msgCol = $app.findCollectionByNameOrId('mensagens_mensagens')
            const msg = new Record(msgCol)
            msg.set('conversa', conv.id)
            msg.set('remetente', adminUser.id)
            msg.set('destinatario_tipo', 'admin')
            msg.set(
              'texto',
              `ALERTA OPERACIONAL: O CPF ${cpfLimpo} já está cadastrado na plataforma (Usuário: ${usuarioExistente.getString('name') || usuarioExistente.email()}, Status atual: ${statusExistente}). Houve tentativa de recadastro com o e-mail ${proEmail} e nome "${proNome}". O bloqueio por CPF foi efetivado com sucesso.`,
            )
            msg.set('lida', false)
            $app.save(msg)
          }
        } catch (notifErr) {
          console.log('Erro ao notificar admin sobre duplicidade de CPF:', notifErr)
        }

        throw new BadRequestError('CPF já cadastrado na plataforma.')
      }
    } catch (findErr) {
      if (findErr instanceof BadRequestError) throw findErr
      console.log('Erro ao verificar duplicidade de CPF:', findErr)
    }
  } else {
    // Se for admin ou empresa e informou CPF, valida e normaliza caso preenchido
    if (cpfLimpo) {
      if (!validarDigitosCPF(cpfLimpo)) {
        throw new BadRequestError('O CPF informado é inválido.')
      }
      record.set('cpf', cpfLimpo)
    }
  }

  e.next()
}, 'users')

// 2. Validação no momento da atualização de usuário (onRecordUpdate)
onRecordUpdate((e) => {
  function validarDigitosCPF(cpfLimpo) {
    if (!cpfLimpo || typeof cpfLimpo !== 'string') return false
    if (cpfLimpo.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false

    let soma = 0
    let resto

    for (let i = 1; i <= 9; i++) {
      soma += parseInt(cpfLimpo.substring(i - 1, i), 10) * (11 - i)
    }
    resto = (soma * 10) % 11
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpfLimpo.substring(9, 10), 10)) return false

    soma = 0
    for (let j = 1; j <= 10; j++) {
      soma += parseInt(cpfLimpo.substring(j - 1, j), 10) * (12 - j)
    }
    resto = (soma * 10) % 11
    if (resto === 10 || resto === 11) resto = 0
    if (resto !== parseInt(cpfLimpo.substring(10, 11), 10)) return false

    return true
  }

  function limparDigitosCPF(valor) {
    if (!valor) return ''
    return String(valor).replace(/\D/g, '')
  }

  const record = e.record
  const role = record.getString('role')
  const rawCpf = record.get('cpf') || ''
  const cpfLimpo = limparDigitosCPF(rawCpf)

  if (role === 'pro') {
    if (!cpfLimpo) {
      throw new BadRequestError('O CPF é obrigatório para profissionais parceiros.')
    }

    if (!validarDigitosCPF(cpfLimpo)) {
      throw new BadRequestError('O CPF informado é inválido. Verifique os dígitos verificadores.')
    }

    record.set('cpf', cpfLimpo)

    // Verificar se outro usuário já usa esse CPF
    try {
      const duplicados = $app.findRecordsByFilter(
        'users',
        "cpf = '" + cpfLimpo + "' && id != '" + record.id + "'",
        '-created',
        1,
        0,
      )

      if (duplicados && duplicados.length > 0) {
        throw new BadRequestError('CPF já cadastrado na plataforma.')
      }
    } catch (dupErr) {
      if (dupErr instanceof BadRequestError) throw dupErr
      console.log('Erro ao validar duplicidade em update de CPF:', dupErr)
    }
  } else if (cpfLimpo) {
    if (!validarDigitosCPF(cpfLimpo)) {
      throw new BadRequestError('O CPF informado é inválido.')
    }
    record.set('cpf', cpfLimpo)
  }

  e.next()
}, 'users')
