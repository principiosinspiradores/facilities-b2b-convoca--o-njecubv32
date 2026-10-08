/* Main entry point for the application - renders the root React component */
import './hooks/useInstallPrompt'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'

// Auto-recuperação de chunks dinâmicos obsoletos após redeploy (404 / Failed to fetch dynamically imported module)
window.addEventListener('error', (event) => {
  const isChunkError =
    event.message &&
    (event.message.includes('dynamically imported module') ||
      event.message.includes('Loading chunk') ||
      event.message.includes('Failed to fetch') ||
      event.message.includes('Importing a module script failed'))
  if (isChunkError) {
    const reloadKey = 'facilities_pwa_chunk_reload'
    const lastReload = sessionStorage.getItem(reloadKey)
    const now = Date.now()
    // Evita loop de recarga caso o erro persista (máximo 1 recarga a cada 10 segundos)
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(reloadKey, String(now))
      console.warn(
        '[PWA] Detectado chunk obsoleto após deploy. Forçando recarga limpa da aplicação...',
      )
      window.location.reload()
    }
  }
})

// Registrar Service Worker de forma segura para PWA (em PROD e ambiente dev)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registrar com timestamp/query para garantir checagem imediata de nova versão pelo browser
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registrado com escopo:', reg.scope)
        // Força checagem de atualização do sw.js em background ao abrir o app
        reg.update().catch(() => {})
      })
      .catch((err) => {
        console.warn('[PWA] Falha ao registrar Service Worker:', err)
      })
  })
}

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(<App />)
