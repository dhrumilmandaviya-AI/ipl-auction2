import { Link, useParams, useLocation } from 'react-router-dom'
import { useAuction } from '../contexts/AuctionContext'
import { useState } from 'react'
import toast from 'react-hot-toast'

export default function Navbar() {
  const { roomId } = useParams()
  const { user, room, logout, myTeam, isAdmin } = useAuction()
  const location = useLocation()
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(room?.code || '')
    setCopied(true)
    toast.success(`Room code ${room?.code} copied!`)
    setTimeout(() => setCopied(false), 2000)
  }

  const links = [
    { to: `/room/${roomId}`, label: '🔨 Auction' },
    { to: `/room/${roomId}/squads`, label: '👥 Squads' },
    { to: `/room/${roomId}/matchday`, label: '📅 Match Day' },
    { to: `/room/${roomId}/transfers`, label: `🔄 Transfers${room?.transfer_window_open ? ' 🟢' : ''}` },
    { to: `/room/${roomId}/leaderboard`, label: '🏆 Points' },
    { to: `/room/${roomId}/results`,     label: '📊 Results' },
    { to: `/room/${roomId}/selection`, label: '🎯 Selection' },
    { to: `/room/${roomId}/rules`, label: '📋 Rules' },
    { to: `/room/${roomId}/season`, label: '🎖️ Season End' },
    ...(isAdmin ? [{ to: `/room/${roomId}/admin`, label: '⚙️ Admin' }] : []),
  ]

  const isActive = (to) => location.pathname === to

  return (
    <nav className="bg-bg-card border-b border-bg-border sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
        {/* Logo */}
        <Link to="/" className="font-display text-2xl text-gold tracking-wider flex-shrink-0">
          IPL🏏
        </Link>

        {/* Room code */}
        {room && (
          <button
            onClick={copyCode}
            className="hidden sm:flex items-center gap-1.5 bg-bg-deep border border-bg-border rounded-lg px-3 py-1.5 hover:border-gold/30 transition-all flex-shrink-0"
          >
            <span className="text-xs text-white/40 font-mono">ROOM</span>
            <span className="font-display text-gold text-lg tracking-widest">{room.code}</span>
            <span className="text-xs text-white/30">{copied ? '✓' : '⎘'}</span>
          </button>
        )}

        {/* Nav links — scrollable so all tabs always reachable */}
        <div className="flex-1 overflow-x-auto scrollbar-none">
          <div className="flex gap-1 min-w-max">
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive(link.to)
                    ? 'bg-gold/15 text-gold border border-gold/30'
                    : 'text-white/50 hover:text-white hover:bg-bg-elevated'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* User badge */}
        {user && (
          <div className="flex items-center gap-2 bg-bg-deep border border-bg-border rounded-lg px-3 py-1.5 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white/80 max-w-28 truncate">{user.teamName}</div>
              {isAdmin && <div className="text-xs text-gold font-mono">ADMIN</div>}
            </div>
            <button
              onClick={logout}
              className="text-xs text-white/30 hover:text-danger transition-colors"
              title="Leave"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
