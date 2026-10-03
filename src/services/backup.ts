import pb from '@/lib/pocketbase/client'
import type { BackupSnapshotPayload } from '@/types/facilities'

/**
 * Faz requisição ao endpoint de backup snapshot.
 * O endpoint valida se o usuário possui role === 'admin'.
 * Retorna o payload completo com header e dados de todas as coleções.
 */
export async function downloadBackupSnapshot(): Promise<BackupSnapshotPayload> {
  const result = await pb.send<BackupSnapshotPayload>('/backend/v1/admin/backup-snapshot', {
    method: 'GET',
  })

  // Dispara o download automático do JSON no navegador
  const dateStr = result.header?.generated_at
    ? result.header.generated_at.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  const filename = `facilities-pro-backup-${dateStr}.json`

  const jsonString = JSON.stringify(result, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return result
}
