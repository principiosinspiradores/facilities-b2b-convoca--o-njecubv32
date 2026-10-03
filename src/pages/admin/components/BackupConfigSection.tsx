import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { formatDateTimeBR } from '@/lib/formatters'
import { downloadBackupSnapshot } from '@/services/backup'
import type { SettingsRecord, BackupSnapshotPayload } from '@/types/facilities'
import {
  Database,
  Download,
  Loader2,
  CheckCircle2,
  Calendar,
  Layers,
  FileJson,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'

interface BackupConfigSectionProps {
  settings: SettingsRecord | null
  onSnapshotSuccess?: () => Promise<void> | void
}

export function BackupConfigSection({ settings, onSnapshotSuccess }: BackupConfigSectionProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [lastSnapshot, setLastSnapshot] = useState<BackupSnapshotPayload | null>(null)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const payload = await downloadBackupSnapshot()
      setLastSnapshot(payload)

      if (onSnapshotSuccess) {
        await onSnapshotSuccess()
      }

      toast({
        title: 'Snapshot gerado e baixado com sucesso',
        description: `Arquivo salvo com ${payload.header.total_collections} coleções da base de dados.`,
      })
    } catch (err: any) {
      console.error('Erro ao gerar snapshot:', err)
      const errorMsg =
        err?.response?.error ||
        err?.data?.error ||
        err?.message ||
        'Não foi possível gerar o snapshot da base. Verifique sua conexão e permissões.'

      toast({
        title: 'Falha ao gerar snapshot',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  // Coleções na ordem esperada de exibição
  const collectionNames = [
    'users',
    'postos',
    'escalas',
    'convocacoes',
    'historico_escalas',
    'payouts',
    'payment_events',
    'disputas',
    'settings',
    'pricing_rules',
    'holidays',
    'funcoes',
    'conta_pix',
    'pontos',
    'mensagens_conversas',
    'mensagens_mensagens',
  ]

  const ultimoSnapshotData = lastSnapshot?.header?.generated_at || settings?.ultimo_snapshot_em

  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-teal-700" />
                Backup de Dados da Base (Snapshot Completo)
              </CardTitle>
              <CardDescription className="mt-1">
                Baixe e guarde este arquivo fora do sistema. Ele contém todos os dados da base em
                formato JSON.
              </CardDescription>
            </div>
            <Button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="bg-teal-700 hover:bg-teal-800 text-white font-medium shrink-0 flex items-center gap-2 shadow-sm"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando snapshot...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Gerar e baixar snapshot
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Informações de status e aviso de segurança */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-700" />
                Último Snapshot Gerado
              </div>
              <div className="text-base font-bold text-slate-800">
                {ultimoSnapshotData ? (
                  <span className="flex items-center gap-2 text-teal-900">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    {formatDateTimeBR(ultimoSnapshotData)}
                  </span>
                ) : (
                  <span className="text-slate-400 font-normal text-sm">
                    Nenhum snapshot registrado anteriormente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Data e horário registrados automaticamente na conclusão do snapshot pelo servidor.
              </p>
            </div>

            <div className="p-4 bg-teal-50/50 rounded-xl border border-teal-200 space-y-2">
              <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                Segurança & Privacidade
              </div>
              <p className="text-xs text-teal-950 leading-relaxed">
                O arquivo exportado preserva perfis completos, histórico operacional e financeiro,
                mas <strong>remove automaticamente segredos de autenticação</strong> (hashes de
                senha e chaves de sessão).
              </p>
            </div>
          </div>

          {/* Contagem de registros por coleção */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-700" />
                Coleções Incluídas no Snapshot (16 tabelas)
              </h3>
              {lastSnapshot?.header?.counts && (
                <Badge
                  variant="outline"
                  className="border-teal-300 text-teal-800 bg-teal-50 text-xs"
                >
                  Snapshot mais recente baixado nesta sessão
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {collectionNames.map((col) => {
                const count = lastSnapshot?.header?.counts?.[col]
                return (
                  <div
                    key={col}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-teal-200 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileJson className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-mono text-slate-700 truncate" title={col}>
                        {col}
                      </span>
                    </div>
                    {typeof count === 'number' ? (
                      <span className="text-xs font-semibold text-teal-700 ml-2 shrink-0 bg-teal-50 px-1.5 py-0.5 rounded">
                        {count} reg.
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 ml-2 shrink-0">incluída</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dica operacional */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Boas práticas de retenção:</strong> Recomenda-se realizar o download
              periodicamente antes de grandes intervenções ou fechamentos de faturamento. Guarde a
              cópia em armazenamento corporativo seguro com controle de acesso restrito.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
