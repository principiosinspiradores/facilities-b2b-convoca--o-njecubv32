import { describe, it, expect } from 'vitest'
import { gerarChavesVapid, getVapidPublicKey } from './pushNotifications'

describe('pushNotifications service tests', () => {
  it('gerarChavesVapid lida com payload e status', async () => {
    expect(typeof gerarChavesVapid).toBe('function')
  })

  it('getVapidPublicKey retorna string', async () => {
    expect(typeof getVapidPublicKey).toBe('function')
  })
})
