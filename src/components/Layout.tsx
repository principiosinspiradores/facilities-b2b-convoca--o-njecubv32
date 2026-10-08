import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ModalPerfilUsuario } from '@/components/ModalPerfilUsuario'
import { useSettings } from '@/contexts/SettingsContext'
import { getLogoUrl } from '@/services/pricing'
import { contarNaoLidas } from '@/services/mensagens'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  Menu,
  LogOut,
  User,
  Building2,
  Calendar,
  Activity,
  Receipt,
  ShieldCheck,
  Calculator,
  ShieldAlert,
  Sliders,
  Inbox,
  Clock,
  QrCode,
  DollarSign,
  MessageSquare,
} from 'lucide-react'

export default function Layout() {
  const { user, role, logout } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0)
  const [perfilModalOpen, setPerfilModalOpen] = useState(false)

  // Atualizar contador de não lidas
  const atualizarContadorMensagens = useCallback(async () => {
    if (!user) return
    try {
      const count = await contarNaoLidas(user.id, role || 'pro')
      setMensagensNaoLidas(count)
    } catch {
      // Silencioso
    }
  }, [user, role])

  useEffect(() => {
    atualizarContadorMensagens()
  }, [atualizarContadorMensagens, location.pathname])

  // Inscrição em realtime nas novas mensagens para atualizar badge instantaneamente
  useRealtime(
    'mensagens_mensagens',
    useCallback(() => {
      atualizarContadorMensagens()
    }, [atualizarContadorMensagens]),
    !!user,
  )

  useRealtime(
    'mensagens_conversas',
    useCallback(() => {
      atualizarContadorMensagens()
    }, [atualizarContadorMensagens]),
    !!user,
  )

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Cores dinâmicas white-label e Logo
  const corPrimaria = settings?.cor_primaria || '#0F766E'
  const corSecundaria = settings?.cor_secundaria || '#134E4A'
  const nomeEmpresa = settings?.nome_empresa || 'Facilities Pro'
  const logoUrl = getLogoUrl(settings)

  // Itens de navegação por papel
  const navItems = []

  if (role === 'pro') {
    navItems.push(
      { to: '/convocacoes', label: 'Minhas Convocações', icon: Inbox },
      { to: '/mensagens', label: 'Mensagens', icon: MessageSquare, badge: mensagensNaoLidas },
      { to: '/minhas-escalas', label: 'Meus Postos / Escalas', icon: Calendar },
      { to: '/ponto-pro', label: 'Bater Ponto Digital', icon: Clock },
      { to: '/meus-repasses', label: 'Meus Repasses (Escrow)', icon: DollarSign },
      { to: '/minha-conta-pix', label: 'Minha Conta Pix', icon: QrCode },
    )
  } else if (role === 'empresa') {
    navItems.push(
      { to: '/mensagens', label: 'Mensagens', icon: MessageSquare, badge: mensagensNaoLidas },
      { to: '/cobertura', label: 'Painel de Cobertura', icon: Activity },
      { to: '/escalas', label: 'Escalas & Convocações', icon: Calendar },
      { to: '/postos', label: 'Postos de Trabalho', icon: Building2 },
      { to: '/gate', label: 'Gate de Pros & Docs', icon: ShieldCheck },
      { to: '/conferencia-ponto', label: 'Espelho de Pontos', icon: Clock },
    )
  } else if (role === 'admin') {
    navItems.push(
      { to: '/mensagens', label: 'Mensagens', icon: MessageSquare, badge: mensagensNaoLidas },
      { to: '/gate', label: 'Gate de Pros & Docs', icon: ShieldCheck },
      { to: '/motor-precos', label: 'Motor de Preços', icon: Calculator },
      { to: '/postos', label: 'Postos de Trabalho', icon: Building2 },
      { to: '/escalas', label: 'Escalas & Convocações', icon: Calendar },
      { to: '/cobertura', label: 'Painel de Cobertura', icon: Activity },
      { to: '/conferencia-ponto', label: 'Espelho de Pontos', icon: Clock },
      { to: '/relatorio-custos', label: 'Custo por Posto', icon: DollarSign },
      { to: '/disputas', label: 'Disputas de Escrow', icon: ShieldAlert },
      { to: '/faturamento', label: 'Faturamento Global', icon: Receipt },
      { to: '/config', label: 'Níveis de Acesso & Config', icon: Sliders },
    )
  }

  // Se não estiver logado (ex. tela pública dentro do layout)
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Outlet />
      </main>
    )
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
      {/* SIDEBAR FIXA DESKTOP (240px) */}
      <aside
        style={{ backgroundColor: corSecundaria }}
        className="hidden lg:flex flex-col w-60 shrink-0 text-white shadow-xl z-20 justify-between"
      >
        <div>
          {/* Logo / Nome White Label */}
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            {logoUrl ? (
              <div className="w-10 h-10 rounded-lg bg-white/10 p-1 flex items-center justify-center overflow-hidden shrink-0 border border-white/20">
                <img
                  src={logoUrl}
                  alt={nomeEmpresa}
                  className="w-full h-full object-contain rounded"
                />
              </div>
            ) : (
              <div
                style={{ backgroundColor: corPrimaria }}
                className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-white text-base shadow shrink-0"
              >
                {nomeEmpresa.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="overflow-hidden">
              <div
                className="font-bold text-sm tracking-tight truncate text-white"
                title={nomeEmpresa}
              >
                {nomeEmpresa}
              </div>
              <div className="text-[10px] text-white/70 uppercase tracking-widest font-semibold truncate">
                Facilities B2B
              </div>
            </div>
          </div>

          {/* Links de navegação */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.to
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={isActive ? { backgroundColor: corPrimaria } : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'text-white shadow-sm'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 shadow-xs">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </NavLink>
              )
            })}
          </nav>
        </div>

        {/* Perfil & Logout no rodapé da Sidebar */}
        <div className="p-3 border-t border-white/10 space-y-2 bg-black/10">
          <button
            type="button"
            onClick={() => setPerfilModalOpen(true)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-white/10 transition-colors cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0 group-hover:ring-2 group-hover:ring-white/40">
              {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden flex-1">
              <div className="text-xs font-bold text-white truncate">{user.name || user.email}</div>
              <div className="text-[10px] text-white/70 capitalize font-medium flex items-center gap-1">
                <span>Perfil: {role}</span>
                <span className="text-[9px] text-white/50">&bull; Notificações</span>
              </div>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-200 hover:bg-red-500/20 hover:text-red-100 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR HEADER */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 shadow-xs">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden text-slate-700">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="p-0 w-72 text-white border-0"
                style={{ backgroundColor: corSecundaria }}
              >
                <div className="p-5 border-b border-white/10 flex items-center gap-3">
                  {logoUrl ? (
                    <div className="w-9 h-9 rounded-lg bg-white/10 p-1 flex items-center justify-center overflow-hidden shrink-0 border border-white/20">
                      <img
                        src={logoUrl}
                        alt={nomeEmpresa}
                        className="w-full h-full object-contain rounded"
                      />
                    </div>
                  ) : (
                    <div
                      style={{ backgroundColor: corPrimaria }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0"
                    >
                      {nomeEmpresa.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <div className="font-bold text-sm text-white truncate">{nomeEmpresa}</div>
                    <div className="text-[10px] text-white/70 uppercase font-semibold">
                      Facilities B2B
                    </div>
                  </div>
                </div>

                <nav className="p-3 space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.to
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        style={isActive ? { backgroundColor: corPrimaria } : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold ${
                          isActive ? 'text-white' : 'text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && item.badge > 0 ? (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        ) : null}
                      </NavLink>
                    )
                  })}
                </nav>

                <div className="p-4 border-t border-white/10 mt-auto">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-red-200 hover:bg-red-500/20"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Nome da plataforma no mobile / status e Logo no Header */}
            <div className="flex items-center gap-2.5">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={nomeEmpresa}
                  className="h-8 w-auto max-w-[120px] object-contain rounded"
                />
              )}
              <div className="lg:hidden font-bold text-sm text-slate-800 truncate">
                {nomeEmpresa}
              </div>
            </div>

            <div className="hidden lg:block text-xs font-medium text-slate-500">
              Ambiente de Convocação e Escrow &bull;{' '}
              <strong className="text-slate-800">{nomeEmpresa}</strong>
            </div>
          </div>

          {/* User info header */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPerfilModalOpen(true)}
              className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-100 transition-colors text-left"
              title="Abrir perfil e notificações"
            >
              <div className="hidden sm:block text-right">
                <div className="text-xs font-bold text-slate-900">{user.name || user.email}</div>
                <div className="text-[11px] text-slate-400 font-medium capitalize">
                  Acesso {role}
                </div>
              </div>
              <div
                style={{ backgroundColor: corPrimaria }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs cursor-pointer hover:ring-2 hover:ring-primary/40"
              >
                {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
              </div>
            </button>
          </div>
        </header>

        {/* CONTEÚDO PRINCIPAL (max-w 1200px) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1200px] w-full mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>

      {/* Modal de Perfil & Notificações Push do Celular */}
      <ModalPerfilUsuario open={perfilModalOpen} onOpenChange={setPerfilModalOpen} />
    </div>
  )
}
