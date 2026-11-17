/// <reference path="../pb_data/types.d.ts" />
// 0056 — Regra de CREATE da coleção `pontos` passa a permitir role 'empresa'
// (mesma regra de list/view/update), para registrar presença/saída manual pela Conferência de Ponto.
// Cirúrgico: nenhuma outra regra, campo ou coleção muda.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('pontos')
    collection.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)"
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('pontos')
    collection.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)"
    app.save(collection)
  },
)
