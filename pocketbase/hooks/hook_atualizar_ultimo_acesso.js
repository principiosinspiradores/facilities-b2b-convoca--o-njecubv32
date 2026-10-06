// pocketbase/hooks/hook_atualizar_ultimo_acesso.js
onRecordAuthRequest((e) => {
  e.next()

  try {
    const record = e.record
    if (record) {
      const nowIso = new Date().toISOString()
      record.set('ultimo_acesso', nowIso)
      $app.save(record)
    }
  } catch (err) {
    console.error('Erro ao atualizar ultimo_acesso no hook:', err)
  }
})
