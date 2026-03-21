import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { isMisconfigured } from './lib/supabase.js'

if (isMisconfigured) {
  document.getElementById('root').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080c14;color:#fff;font-family:monospace;text-align:center;padding:24px">
      <div>
        <div style="font-size:3rem;margin-bottom:16px">⚙️</div>
        <div style="font-size:1.2rem;color:#f59e0b;margin-bottom:8px">Configuration Missing</div>
        <div style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.8">
          VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.<br/>
          Add them as GitHub repository secrets and redeploy.
        </div>
      </div>
    </div>
  `
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
