import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import { AuthProvider } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { RequireAuth, RequireRole } from '@/components/RouteGuards'

import Layout from '@/components/Layout'
import Index from '@/pages/Index'
import NotFound from '@/pages/NotFound'
import MensagensPage from '@/pages/Mensagens'

// Auth Pages
import LoginPage from '@/pages/auth/Login'
import ForgotPasswordPage from '@/pages/auth/ForgotPassword'
import ResetPasswordPage from '@/pages/auth/ResetPassword'
import VerifyEmailPage from '@/pages/auth/VerifyEmail'
import ConfirmEmailChangePage from '@/pages/auth/ConfirmEmailChange'

// Pro Pages
import ConvocacoesPage from '@/pages/pro/Convocacoes'
import MinhasEscalasPage from '@/pages/pro/MinhasEscalas'
import MeusRepassesPage from '@/pages/pro/MeusRepasses'
import MinhaContaPixPage from '@/pages/pro/MinhaContaPix'
import PontoProPage from '@/pages/pro/PontoPro'

// Empresa Pages
import PostosPage from '@/pages/empresa/Postos'
import EscalasPage from '@/pages/empresa/Escalas'
import CoberturaPage from '@/pages/empresa/Cobertura'
import FaturamentoPage from '@/pages/empresa/Faturamento'
import ConferenciaPontoPage from '@/pages/empresa/ConferenciaPonto'
import RelatorioCustosPage from '@/pages/empresa/RelatorioCustos'

// Admin Pages
import GateProsPage from '@/pages/admin/GatePros'
import MotorPrecosPage from '@/pages/admin/MotorPrecos'
import DisputasPage from '@/pages/admin/Disputas'
import ConfigPage from '@/pages/admin/Config'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rotas Públicas de Autenticação */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />

            {/* Rotas Autenticadas no Layout Compartilhado */}
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />

              {/* Rotas do Pro */}
              <Route
                path="/convocacoes"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'admin']}>
                      <ConvocacoesPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/minhas-escalas"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'admin']}>
                      <MinhasEscalasPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/ponto-pro"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'admin']}>
                      <PontoProPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/meus-repasses"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'admin']}>
                      <MeusRepassesPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/minha-conta-pix"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'admin']}>
                      <MinhaContaPixPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />

              {/* Rota Compartilhada de Mensagens Internas (Pro, Empresa, Admin) */}
              <Route
                path="/mensagens"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['pro', 'empresa', 'admin']}>
                      <MensagensPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />

              {/* Rotas Operacionais Compartilhadas (Empresa & Admin) */}
              <Route
                path="/gate"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['empresa', 'admin']}>
                      <GateProsPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/postos"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['empresa', 'admin']}>
                      <PostosPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/escalas"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['empresa', 'admin']}>
                      <EscalasPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/cobertura"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['empresa', 'admin']}>
                      <CoberturaPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/conferencia-ponto"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['empresa', 'admin']}>
                      <ConferenciaPontoPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              {/* Rotas Exclusivas do Admin — Empresa NÃO tem acesso a Faturamento, Relatório de Custos nem Config/Motor/Disputas */}
              <Route
                path="/relatorio-custos"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <RelatorioCustosPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/faturamento"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <FaturamentoPage isAdmin={true} />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/faturamento-admin"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <Navigate to="/faturamento" replace />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/motor-precos"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <MotorPrecosPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/disputas"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <DisputasPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
              <Route
                path="/config"
                element={
                  <RequireAuth>
                    <RequireRole allowedRoles={['admin']}>
                      <ConfigPage />
                    </RequireRole>
                  </RequireAuth>
                }
              />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </SettingsProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
