import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './App.css'
import { initDatadogRum } from './lib/datadogRum'

// Initialize Datadog RUM once at startup so it captures views/sessions across
// the whole app. No-op unless VITE_DATADOG_APPLICATION_ID + _CLIENT_TOKEN are set.
initDatadogRum()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
