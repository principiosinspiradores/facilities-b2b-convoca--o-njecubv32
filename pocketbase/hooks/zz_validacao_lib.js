// pocketbase/hooks/zz_validacao_lib.js
// Arquivo temporário de validação de carregamento de módulo no boot do servidor
try {
  let V = null
  let caminhoUsado = ''
  try {
    V = require(`${__hooks}/lib_vapid.js`)
    caminhoUsado = `${__hooks}/lib_vapid.js`
  } catch (err1) {
    try {
      V = require('./lib_vapid.js')
      caminhoUsado = './lib_vapid.js'
    } catch (err2) {
      try {
        V = require('lib_vapid.js')
        caminhoUsado = 'lib_vapid.js'
      } catch (err3) {
        throw new Error(`Tentativas falharam: [1] ${err1} [2] ${err2} [3] ${err3}`)
      }
    }
  }

  if (V && typeof V === 'object') {
    const fnNames = Object.keys(V).join(',')
    console.log('[VALIDACAO] lib_vapid carregada OK, funções:', fnNames, '(via ' + caminhoUsado + ')')
  } else {
    console.log('[VALIDACAO] lib_vapid carregou mas objeto vazio ou inválido:', typeof V)
  }
} catch (errGlobal) {
  console.log('[VALIDACAO] Erro ao carregar lib_vapid:', errGlobal && errGlobal.stack ? errGlobal.stack : String(errGlobal))
}
