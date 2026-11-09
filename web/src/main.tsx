import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import AuthGate from './auth'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary><AuthGate><App /></AuthGate></AppErrorBoundary>
  </React.StrictMode>,
)
