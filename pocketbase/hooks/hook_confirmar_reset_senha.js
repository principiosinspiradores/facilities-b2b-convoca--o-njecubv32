// pocketbase/hooks/hook_confirmar_reset_senha.js
// Garante que, ao confirmar a redefinição de senha / primeiro acesso,
// o usuário tenha seu e-mail marcado como verificado (verified = true).
onRecordConfirmPasswordResetRequest((e) => {
  e.next()

  try {
    const record = e.record
    if (record) {
      if (!record.verified()) {
        record.setVerified(true)
      }
      record.set('emailVisibility', true)
      $app.save(record)
    }
  } catch (err) {
    console.log('Erro ao garantir verified=true em onRecordConfirmPasswordResetRequest:', err)
  }
}, 'users')
