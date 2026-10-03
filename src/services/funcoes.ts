import pb from '@/lib/pocketbase/client'
import { FuncaoRecord } from '@/types/facilities'

/**
 * Lista todas as funções cadastradas.
 * Se apenasAtivas = true (padrão em formulários de seleção), retorna apenas ativo = true.
 */
export async function listarFuncoes(apenasAtivas: boolean = false): Promise<FuncaoRecord[]> {
  const options: Record<string, any> = {
    sort: 'nome',
    expand: 'criada_por',
  }

  if (apenasAtivas) {
    options.filter = 'ativo = true'
  }

  return pb.collection('funcoes').getFullList<FuncaoRecord>(options)
}

/**
 * Cria uma nova função no catálogo.
 * Disponível para Admin e Empresa.
 */
export async function criarFuncao(dados: {
  nome: string
  descricao?: string
  ativo?: boolean
}): Promise<FuncaoRecord> {
  const currentUser = pb.authStore.record

  const payload: Record<string, any> = {
    nome: dados.nome.trim(),
    descricao: (dados.descricao || '').trim(),
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    criada_por: currentUser?.id || null,
  }

  return pb.collection('funcoes').create<FuncaoRecord>(payload)
}

/**
 * Atualiza uma função no catálogo (Admin).
 */
export async function atualizarFuncao(
  id: string,
  dados: {
    nome?: string
    descricao?: string
    ativo?: boolean
  },
): Promise<FuncaoRecord> {
  const payload: Record<string, any> = {}
  if (dados.nome !== undefined) payload.nome = dados.nome.trim()
  if (dados.descricao !== undefined) payload.descricao = dados.descricao.trim()
  if (dados.ativo !== undefined) payload.ativo = dados.ativo

  return pb.collection('funcoes').update<FuncaoRecord>(id, payload)
}

/**
 * Altera status ativo/inativo de uma função (Admin).
 */
export async function alternarStatusFuncao(id: string, ativo: boolean): Promise<FuncaoRecord> {
  return pb.collection('funcoes').update<FuncaoRecord>(id, { ativo })
}

/**
 * Conta quantos postos estão vinculados a uma função.
 * Usado para prevenir exclusão ou avisar o usuário.
 */
export async function contarPostosPorFuncao(nomeFuncao: string): Promise<number> {
  try {
    const list = await pb.collection('postos').getList(1, 1, {
      filter: `funcao = "${nomeFuncao.replace(/"/g, '\\"')}"`,
    })
    return list.totalItems
  } catch (err) {
    console.error('Erro ao contar postos vinculados à função:', err)
    return 0
  }
}
