import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, readStoredTheme } from './lib/theme.js'

// 在第一次繪製前套用主題，避免閃一下預設色
applyTheme(readStoredTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
