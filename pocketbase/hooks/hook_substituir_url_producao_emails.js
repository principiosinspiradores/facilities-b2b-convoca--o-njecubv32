// pocketbase/hooks/hook_substituir_url_producao_emails.js
// Intercepta TODOS os e-mails enviados pelo PocketBase (transacionais, redefinição de senha,
// verificação de e-mail e customizados) garantindo que qualquer link aponte
// estritamente para o domínio de produção https://app.housekeeping.com.br.
onMailerSend((e) => {
  try {
    const msg = e.message
    if (!msg) {
      e.next()
      return
    }

    const previewDomainRegex = /https?:\/\/facilities-b2b-convocacao-ae810\.goskip\.app/g
    const previewDevDomainRegex =
      /https?:\/\/facilities-b2b-convocacao-ae810\.shrd00\.internal\.goskip\.dev/g
    const wwwDomainRegex = /https?:\/\/www\.housekeeping\.com\.br/g
    const prodDomain = 'https://app.housekeeping.com.br'

    if (msg.html && typeof msg.html === 'string') {
      let updatedHtml = msg.html
      updatedHtml = updatedHtml.replace(previewDomainRegex, prodDomain)
      updatedHtml = updatedHtml.replace(previewDevDomainRegex, prodDomain)
      updatedHtml = updatedHtml.replace(wwwDomainRegex, prodDomain)
      msg.html = updatedHtml
    }

    if (msg.text && typeof msg.text === 'string') {
      let updatedText = msg.text
      updatedText = updatedText.replace(previewDomainRegex, prodDomain)
      updatedText = updatedText.replace(previewDevDomainRegex, prodDomain)
      updatedText = updatedText.replace(wwwDomainRegex, prodDomain)
      msg.text = updatedText
    }
  } catch (err) {
    console.log('Erro ao interceptar e-mail no onMailerSend:', err)
  }

  e.next()
})
