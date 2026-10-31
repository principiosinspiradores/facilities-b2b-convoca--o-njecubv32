// pocketbase/hooks/lib_data_br.js
// Helper compartilhado para padronização de data no formato brasileiro (dd/mm/aaaa) em notificações e e-mails.
// SEM new Date() ou toISOString para evitar qualquer deslocamento de fuso horário.

function formatarDataBR(iso) {
  if (!iso || typeof iso !== 'string') return iso || ''

  const limpo = iso.trim()
  if (!limpo) return ''

  // Se já estiver no formato dd/mm/aaaa, retorna inalterado
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpo)) {
    return limpo
  }

  // Extrai a parte da data caso venha com timestamp (ex: "2026-03-24T08:00:00Z" ou "2026-03-24 08:00:00")
  const apenasData = limpo.slice(0, 10)

  // Valida o padrão aaaa-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(apenasData)) {
    const partes = apenasData.split('-')
    return partes[2] + '/' + partes[1] + '/' + partes[0]
  }

  // Se não bater com o formato, retorna a própria string inalterada
  return limpo
}

const dataBrExports = {
  formatarDataBR: formatarDataBR,
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = dataBrExports
}
if (typeof globalThis !== 'undefined') {
  globalThis.DataBRExports = dataBrExports
}
