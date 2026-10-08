import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Smartphone, Share, PlusSquare } from 'lucide-react'

interface ModalInstalarAppProps {
  iosOpen: boolean
  onIosOpenChange: (open: boolean) => void
  desktopOpen: boolean
  onDesktopOpenChange: (open: boolean) => void
}

export function ModalInstalarApp({
  iosOpen,
  onIosOpenChange,
  desktopOpen,
  onDesktopOpenChange,
}: ModalInstalarAppProps) {
  return (
    <>
      {/* MODAL GUIA VISUAL: INSTALAÇÃO NO IPHONE / IPAD (SAFARI) */}
      <Dialog open={iosOpen} onOpenChange={onIosOpenChange}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl">
          <DialogHeader className="text-center sm:text-left space-y-2">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Instalar Aplicativo no iPhone
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Siga estes 3 passos simples no Safari para abrir o aplicativo com 1 toque na tela de
              início:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            {/* Passo 1 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  Toque em Compartilhar
                  <span className="inline-flex items-center justify-center p-1 rounded bg-slate-200/80 text-blue-600">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Na barra inferior do Safari (no rodapé da tela do iPhone), toque no ícone com o
                  quadrado e a seta para cima.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  Role e toque em "Adicionar à Tela de Início"
                  <span className="inline-flex items-center justify-center p-1 rounded bg-slate-200/80 text-slate-700">
                    <PlusSquare className="w-3.5 h-3.5" />
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Role as opções da lista para baixo até encontrar e clicar em{' '}
                  <strong className="text-slate-700 font-semibold">
                    Adicionar à Tela de Início
                  </strong>
                  .
                </p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-800">
                  Toque em <strong className="text-primary font-bold">"Adicionar"</strong> no canto
                  superior direito
                </p>
                <p className="text-[11px] text-slate-500">
                  Pronto! O ícone do aplicativo aparecerá como um app nativo na sua tela inicial,
                  com notificações push e acesso rápido.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold py-2"
              onClick={() => onIosOpenChange(false)}
            >
              Entendi, vou adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL GUIA DESKTOP / OUTROS NAVEGADORES */}
      <Dialog open={desktopOpen} onOpenChange={onDesktopOpenChange}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl">
          <DialogHeader className="text-center sm:text-left space-y-2">
            <div className="mx-auto sm:mx-0 w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Instalar Aplicativo
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Instale o aplicativo diretamente no seu dispositivo:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-600">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="font-semibold text-slate-800">No celular Android (Chrome):</p>
              <p className="text-[11px] text-slate-500">
                Abra este endereço no Google Chrome. Se a janela de 1 clique não abrir de imediato,
                toque nos 3 pontinhos do Chrome e selecione{' '}
                <strong className="text-slate-700">"Instalar aplicativo"</strong>.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="font-semibold text-slate-800">No computador (Chrome / Edge):</p>
              <p className="text-[11px] text-slate-500">
                Clique no ícone de instalação <strong className="text-slate-700">⊕</strong> na barra
                de endereços do seu navegador para fixar o app na área de trabalho.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold"
              onClick={() => onDesktopOpenChange(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
