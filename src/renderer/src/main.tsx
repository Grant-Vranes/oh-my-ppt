import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { LangProvider } from './i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RendererErrorBoundary>
      <LangProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </LangProvider>
    </RendererErrorBoundary>
  </StrictMode>
)
