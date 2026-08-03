import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { BackendProvider } from './backends/index.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BackendProvider>
        <App />
      </BackendProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
