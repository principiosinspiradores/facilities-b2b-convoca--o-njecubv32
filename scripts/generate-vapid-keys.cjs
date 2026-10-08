// scripts/generate-vapid-keys.cjs
// Script para gerar par de chaves VAPID P-256 (prime256v1 / secp256r1)
// Saída: chave pública de 65 bytes (base64url) e chave privada de 32 bytes (base64url)
const crypto = require('node:crypto')

function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()

  let publicKeyBuffer = ecdh.getPublicKey()
  let privateKeyBuffer = ecdh.getPrivateKey()

  // Assegurar padding de 32 bytes para a privada e 65 bytes para a pública não-comprimida
  if (privateKeyBuffer.length < 32) {
    const pad = Buffer.alloc(32 - privateKeyBuffer.length, 0)
    privateKeyBuffer = Buffer.concat([pad, privateKeyBuffer])
  }

  if (publicKeyBuffer.length < 65) {
    const pad = Buffer.alloc(65 - publicKeyBuffer.length, 0)
    publicKeyBuffer = Buffer.concat([pad, publicKeyBuffer])
  }

  const publicKeyBase64Url = publicKeyBuffer.toString('base64url')
  const privateKeyBase64Url = privateKeyBuffer.toString('base64url')

  return {
    publicKey: publicKeyBase64Url,
    privateKey: privateKeyBase64Url,
  }
}

const keys = generateVapidKeys()

console.log('====================================================')
console.log('CHAVES VAPID P-256 GERADAS COM SUCESSO (WEB PUSH):')
console.log('====================================================')
console.log('VAPID_PUBLIC_KEY:')
console.log(keys.publicKey)
console.log('\nVAPID_PRIVATE_KEY:')
console.log(keys.privateKey)
console.log('\nVAPID_SUBJECT recomendado:')
console.log('mailto:contato@housekeeping.com.br')
console.log('====================================================')

module.exports = { generateVapidKeys }
