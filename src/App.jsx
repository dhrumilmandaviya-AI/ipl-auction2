import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuctionProvider } from './contexts/AuctionContext'
import Landing from './pages/Landing'
import AuctionRoom from './pages/AuctionRoom'
import AdminPanel from './pages/AdminPanel'
import Squads from './pages/Squads'
import Leaderboard from './pages/Leaderboard'
import TransferWindow from './pages/TransferWindow'
import MatchDayTracker from './pages/MatchDayTracker'
import SeasonEnd from './pages/SeasonEnd'
import Rules from './pages/Rules'

export default function App() {
  return (
    <HashRouter>
      <AuctionProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#0e1420',
              color: '#fff',
              border: '1px solid #1e2a3a',
              fontFamily: 'Outfit, sans-serif',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<AuctionRoom />} />
          <Route path="/room/:roomId/admin" element={<AdminPanel />} />
          <Route path="/room/:roomId/squads" element={<Squads />} />
          <Route path="/room/:roomId/leaderboard" element={<Leaderboard />} />
          <Route path="/room/:roomId/transfers" element={<TransferWindow />} />
          <Route path="/room/:roomId/matchday" element={<MatchDayTracker />} />
          <Route path="/room/:roomId/season" element={<SeasonEnd />} />
          <Route path="/room/:roomId/rules" element={<Rules />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuctionProvider>
    </HashRouter>
  )
}
