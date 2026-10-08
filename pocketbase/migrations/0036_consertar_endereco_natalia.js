migrate(
  (app) => {
    // Definir explicitamente o endereço de Natalia corrigido e sem regiao
    const endNatalia = JSON.stringify({
      bairro: 'Parque Residencial Vila União',
      cep: '13060715',
      cidade: 'Campinas',
      logradouro: 'Rua Luis Nadalin 68',
      uf: 'SP',
    })

    app
      .db()
      .newQuery('UPDATE users SET endereco_completo = {:ec} WHERE id = {:id}')
      .bind({
        ec: endNatalia,
        id: 'e1idzk8kslnisju',
      })
      .execute()
  },
  (app) => {},
)
