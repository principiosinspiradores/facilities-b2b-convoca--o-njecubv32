migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Criar coleção 'funcoes'
    let funcoes
    try {
      funcoes = app.findCollectionByNameOrId('funcoes')
    } catch (_) {
      funcoes = new Collection({
        name: 'funcoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'descricao', type: 'text' },
          { name: 'ativo', type: 'bool' },
          {
            name: 'criada_por',
            type: 'relation',
            collectionId: users.id,
            maxSelect: 1,
            cascadeDelete: false,
            required: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_funcoes_nome ON funcoes (nome)'],
      })
      app.save(funcoes)
    }

    // 2. Semear funções existentes: 'porteiro', 'limpeza', 'zeladoria', 'outro' e qualquer outra usada nos postos
    const defaultFuncoes = [
      { nome: 'Porteiro', descricao: 'Controle de portaria e recepção predial' },
      { nome: 'Limpeza', descricao: 'Higienização, conservação e limpeza predial/industrial' },
      { nome: 'Zeladoria', descricao: 'Manutenção preventiva, coordenação e inspeção predial' },
      { nome: 'Outro', descricao: 'Outras atribuições operacionais e de facilities' },
    ]

    for (const item of defaultFuncoes) {
      try {
        app.findFirstRecordByData('funcoes', 'nome', item.nome)
      } catch (_) {
        const record = new Record(funcoes)
        record.set('nome', item.nome)
        record.set('descricao', item.descricao)
        record.set('ativo', true)
        app.save(record)
      }
    }

    // 3. Atualizar coleção 'postos': alterar o campo 'funcao' de select para text livre (para aceitar qualquer nome do catálogo)
    const postos = app.findCollectionByNameOrId('postos')
    postos.fields.removeByName('funcao')
    postos.fields.add(
      new TextField({
        name: 'funcao',
        required: true,
      }),
    )
    app.save(postos)

    // 4. Normalizar nomes nos postos existentes para maiúsculo inicial amigável (Porteiro, Limpeza, etc.) se estiverem em minúsculo
    try {
      app
        .db()
        .newQuery("UPDATE postos SET funcao = 'Porteiro' WHERE LOWER(funcao) = 'porteiro'")
        .execute()
      app
        .db()
        .newQuery("UPDATE postos SET funcao = 'Limpeza' WHERE LOWER(funcao) = 'limpeza'")
        .execute()
      app
        .db()
        .newQuery("UPDATE postos SET funcao = 'Zeladoria' WHERE LOWER(funcao) = 'zeladoria'")
        .execute()
      app
        .db()
        .newQuery("UPDATE postos SET funcao = 'Outro' WHERE LOWER(funcao) = 'outro'")
        .execute()
    } catch (err) {
      console.log('Aviso ao normalizar postos existentes:', err)
    }
  },
  (app) => {
    // Reversão
    try {
      const funcoes = app.findCollectionByNameOrId('funcoes')
      app.delete(funcoes)
    } catch (_) {}

    try {
      const postos = app.findCollectionByNameOrId('postos')
      postos.fields.removeByName('funcao')
      postos.fields.add(
        new SelectField({
          name: 'funcao',
          values: ['porteiro', 'limpeza', 'zeladoria', 'outro'],
          maxSelect: 1,
          required: true,
        }),
      )
      app.save(postos)
    } catch (_) {}
  },
)
