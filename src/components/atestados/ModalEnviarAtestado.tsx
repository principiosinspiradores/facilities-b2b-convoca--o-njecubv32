import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { FileUp, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { enviarAtestado } from '@/services/atestados'
import { ConvocacaoRecord } from '@/types/facilities'
import { formatDateBR } from '@/lib/formatters'

interface ModalEnviarAtestadoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  convocacao: ConvocacaoRecord | null
  proId: string
  onSuccess?: () => void
}

export function ModalEnviarAtestado({
  open,
  onOpenChange,
  convocacao,
  proId,
  onSuccess,
}: ModalEnviarAtestadoProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    setFileError(null)
    if (!selected) {
      setFile(null)
      return
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (selected.size > maxSize) {
      setFileError('O arquivo excede o tamanho máximo permitido de 10MB.')
      setFile(null)
      return
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (
      !allowedTypes.includes(selected.type) &&
      !selected.name.match(/\.(pdf|jpe?g|png|webp|heic)$/i)
    ) {
      setFileError('Tipo de arquivo não suportado. Envie um arquivo PDF ou imagem (JPG/PNG).')
      setFile(null)
      return
    }

    setFile(selected)
  }

  const handleSubmit = async () => {
    if (!convocacao || !proId || !file) {
      setFileError('Selecione um arquivo de atestado válido.')
      return
    }

    setIsSubmitting(true)
    try {
      await enviarAtestado({
        convocacaoId: convocacao.id,
        proId: proId,
        arquivo: file,
      })

      toast({
        title: 'Atestado enviado com sucesso!',
        description:
          'Seu atestado médico foi registrado e está pendente de validação pela equipe gestora. A cobrança de falta foi suspensa.',
      })

      setFile(null)
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      console.error('Erro ao enviar atestado:', err)
      toast({
        title: 'Erro ao enviar atestado',
        description: 'Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const escala = convocacao?.expand?.escala
  const posto = escala?.expand?.posto

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Enviar Atestado Médico
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Justifique sua ausência para análise e abono de falta pela gestão de facilities.
          </DialogDescription>
        </DialogHeader>

        {convocacao && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">Posto:</span> {posto?.nome || 'Posto'}
            </div>
            <div>
              <span className="font-semibold text-slate-900">Data do Turno:</span>{' '}
              {formatDateBR(escala?.data)} ({escala?.turno_inicio} às {escala?.turno_fim})
            </div>
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
              O atestado passará por auditoria pela empresa/admin. Enquanto estiver pendente,
              nenhuma multa de falta será retida.
            </div>
          </div>
        )}

        <div className="space-y-3 py-2">
          <Label className="text-xs font-semibold text-slate-700">
            Documento de Comprovação (PDF ou Foto - Máx 10MB)
          </Label>

          <div className="border-2 border-dashed border-slate-300 hover:border-primary rounded-lg p-4 text-center cursor-pointer transition-colors relative bg-slate-50/50">
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-primary font-medium text-xs">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate max-w-[260px]">{file.name}</span>
                <span className="text-[10px] text-slate-500">
                  ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
            ) : (
              <div className="space-y-1 text-slate-500">
                <FileUp className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-slate-700">
                  Clique ou arraste o arquivo do atestado
                </p>
                <p className="text-[10px] text-slate-400">PDF, JPG, PNG ou WEBP até 10MB</p>
              </div>
            )}
          </div>

          {fileError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFile(null)
              onOpenChange(false)
            }}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!file || isSubmitting}
            className="text-xs font-medium"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <FileUp className="w-3.5 h-3.5 mr-1.5" />
                Confirmar Envio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
