import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { isMisconfigured } from './lib/supabase.js'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error: error.message || String(error) }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#080c14',color:'#fff',fontFamily:'monospace',textAlign:'center',padding:'24px'}}>
          <div>
            <div style={{fontSize:'2rem',marginBottom:'16px'}}>💥</div>
            <div style={{color:'#ef4444',marginBottom:'12px',fontSize:'0.9rem'}}>App crashed — error below:</div>
            <div style={{background:'#0e1420',border:'1px solid #1e2a3a',borderRadius:'8px',padding:'16px',maxWidth:'600px',textAlign:'left',fontSize:'0.75rem',color:'#fbbf24',lineHeight:'1.6',wordBreak:'break-all'}}>
              {this.state.error}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
