import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import './index.css'
import App from './App.tsx'

// Capture the install prompt as early as possible — it can fire before any
// React component mounts. We stash it on window and re-dispatch so late-mounting
// components (e.g. the attendance modal) can still offer "Install".
declare global {
  interface Window { __deferredInstallPrompt?: Event | null }
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__deferredInstallPrompt = e
  window.dispatchEvent(new Event('pwa-install-available'))
})
window.addEventListener('appinstalled', () => {
  window.__deferredInstallPrompt = null
  window.dispatchEvent(new Event('pwa-installed'))
})

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)