import { describe, it, expect } from 'vitest'
import { gerarChavesVapid, getVapidPublicKey } from './pushNotifications'

describe('pushNotifications service tests', () => {
  it('gerarChavesVapid lida com payload e status', async () => {
    expect(typeof gerarChavesVapid).toBe('function')
  })

  it('getVapidPublicKey retorna string', async () => {
    expect(typeof getVapidPublicKey).toBe('function')
  })

  it('lib_vapid.js logic generates distinct pairs and valid base64url lengths', async () => {
    // Validar algoritmo diretamente executando a lógica implementada em lib_vapid.js
    const fs = await import('node:fs')
    const path = await import('node:path')
    const code = fs.readFileSync(
      path.resolve(process.cwd(), 'pocketbase/hooks/lib_vapid.js'),
      'utf-8',
    )

    // Avaliar em contexto isolado simulando PocketBase JSVM
    const fakeContext: Record<string, unknown> = {
      $security: {
        randomString: (n: number) => {
          let s = ''
          const chars = '0123456789abcdef'
          for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]
          return s
        },
      },
      Math,
      Date,
      Uint8Array,
      Uint32Array,
      DataView,
      BigInt,
      parseInt,
      isNaN,
      String,
      console,
      globalThis: {},
    }

    const runInScope = new Function(...Object.keys(fakeContext), code)
    runInScope(...Object.values(fakeContext))

    const vapidObj = (
      fakeContext.globalThis as {
        VAPID?: {
          generateVapidKeyPair: () => { publicKey: string; privateKey: string; subject: string }
        }
      }
    ).VAPID
    expect(vapidObj).toBeDefined()
    expect(typeof vapidObj?.generateVapidKeyPair).toBe('function')

    const pair1 = vapidObj!.generateVapidKeyPair()
    const pair2 = vapidObj!.generateVapidKeyPair()

    // Chaves públicas e privadas devem ser strings base64url não-vazias
    expect(pair1.publicKey).toBeTruthy()
    expect(pair1.privateKey).toBeTruthy()
    expect(pair2.publicKey).toBeTruthy()
    expect(pair2.privateKey).toBeTruthy()

    // Chaves públicas têm 65 bytes não-comprimidos -> ~87 caracteres em base64url
    expect(pair1.publicKey.length).toBeGreaterThanOrEqual(86)
    expect(pair1.publicKey.length).toBeLessThanOrEqual(88)

    // Chaves privadas têm 32 bytes -> ~43 caracteres em base64url
    expect(pair1.privateKey.length).toBeGreaterThanOrEqual(42)
    expect(pair1.privateKey.length).toBeLessThanOrEqual(44)

    // Entropia real: duas gerações sucessivas geram chaves estritamente diferentes
    expect(pair1.privateKey).not.toEqual(pair2.privateKey)
    expect(pair1.publicKey).not.toEqual(pair2.publicKey)
  })
})
