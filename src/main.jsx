import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { BackendProvider } from './backends/index.jsx'
import PwaBanner from './components/PwaBanner.jsx'
import { initPwa } from './pwa.js'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BackendProvider>
        <App />
      </BackendProvider>
      <PwaBanner />
    </BrowserRouter>
  </React.StrictMode>,
)

// 서비스워커 등록. 새 버전은 사용자가 배너를 눌러야 교체된다.
initPwa()
