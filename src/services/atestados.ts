import pb from '@/lib/pocketbase/client'
import type { AtestadoRecord, AtestadoStatusValidacao } from '@/types/facilities'

export async function listarAtestados(filtro?: string): Promise<AtestadoRecord[]> {
  return await pb.collection('atestados').getFullList<AtestadoRecord>({
    filter: filtro,
    sort: '-created',
    expand: 'convocacao.escala.posto,pro,validado_por',
  })
}

export async function listarAtestadosPorPro(proId: string): Promise<AtestadoRecord[]> {
  return await pb.collection('atestados').getFullList<AtestadoRecord>({
    filter: `pro = "${proId}"`,
    sort: '-created',
    expand: 'convocacao.escala.posto,validado_por',
  })
}

export async function listarAtestadosPorConvocacao(
  convocacaoId: string,
): Promise<AtestadoRecord[]> {
  return await pb.collection('atestados').getFullList<AtestadoRecord>({
    filter: `convocacao = "${convocacaoId}"`,
    sort: '-created',
    expand: 'convocacao.escala.posto,validado_por',
  })
}

export async function enviarAtestado(payload: {
  convocacaoId: string
  proId: string
  arquivo: File
}): Promise<AtestadoRecord> {
  const formData = new FormData()
  formData.append('convocacao', payload.convocacaoId)
  formData.append('pro', payload.proId)
  formData.append('arquivo', payload.arquivo)
  formData.append('data_envio', new Date().toISOString())
  formData.append('status_validacao', 'pendente')

  return await pb.collection('atestados').create<AtestadoRecord>(formData)
}

export async function validarAtestado(payload: {
  atestadoId: string
  status: 'aprovado' | 'rejeitado'
  validadoPorId: string
  observacao?: string
}): Promise<AtestadoRecord> {
  return await pb.collection('atestados').update<AtestadoRecord>(payload.atestadoId, {
    status_validacao: payload.status,
    validado_por: payload.validadoPorId,
    observacao_validacao: payload.observacao || '',
  })
}

export function getAtestadoArquivoUrl(atestado: AtestadoRecord): string {
  if (!atestado.arquivo) return ''
  return pb.files.getURL(atestado, atestado.arquivo)
}
