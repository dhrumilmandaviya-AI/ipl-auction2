import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuction } from '../contexts/AuctionContext'
import Navbar from '../components/Navbar'

export default function Rules() {
  const [tab, setTab] = useState('auction')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="max-w-screen-lg mx-auto w-full p-4 space-y-5">

        <div className="text-center pt-2">
          <h1 className="font-display text-5xl text-gold">Rules</h1>
          <p className="text-white/30 font-mono text-sm mt-1">Auction rules · Fantasy points · Transfers</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-bg-card border border-bg-border rounded-xl p-1">
          {[
            { id: 'auction',  label: '🔨 Auction Rules' },
            { id: 'points',   label: '📊 Fantasy Points' },
            { id: 'transfer', label: '🔄 Transfers' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                tab === t.id ? 'bg-gold text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'auction'  && <AuctionRules />}
        {tab === 'points'   && <PointsRules />}
        {tab === 'transfer' && <TransferRules />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

function AuctionRules() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      <Section title="💰 Budget & Squad">
        <RuleRow label="Purse per team" value="₹100 Crore" highlight />
        <RuleRow label="Max players from one IPL team" value="4" highlight />
        <RuleRow label="Maximum overseas players" value="7" />
        <RuleRow label="Maximum overseas in playing XI" value="5" />
        <RuleRow label="Season squad selection" value="15 players" highlight />
        <RuleRow label="Players counted for fantasy points" value="Top 11 of selected 15" />
      </Section>

      <Section title="📈 Bid Increments">
        <RuleRow label="Base price (all players)" value="₹20 Lakhs" highlight />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/30 font-mono text-xs uppercase border-b border-bg-border">
                <th className="text-left py-2">Current Bid</th>
                <th className="text-right py-2">Increment</th>
                <th className="text-right py-2">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border/40">
              {[
                ['₹0 – ₹2 Crore', '+₹20 Lakhs', '20L → 40L → 60L...'],
                ['₹2 Crore – ₹7 Crore', '+₹25 Lakhs', '2Cr → 2.25Cr → 2.5Cr...'],
                ['Above ₹7 Crore', '+₹50 Lakhs', '7Cr → 7.5Cr → 8Cr...'],
              ].map(([range, inc, ex]) => (
                <tr key={range}>
                  <td className="py-2 text-white/70 text-sm">{range}</td>
                  <td className="py-2 text-right font-bold text-gold font-mono">{inc}</td>
                  <td className="py-2 text-right text-white/30 font-mono text-xs">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="⚡ Lifelines">
        <RuleRow label="Lifelines per team" value="3" highlight />
        <Divider />
        <Rule>Only the <strong className="text-gold">current highest bidder</strong> can use a lifeline</Rule>
        <Rule>Using a lifeline <strong className="text-white">retracts your bid</strong> — the previous bidder gets the chance to buy at their price</Rule>
        <Rule>If no previous bidder exists, the lifeline is <strong className="text-danger">wasted</strong> and the player goes back to pending</Rule>
        <Rule>Lifelines cannot be recovered once used</Rule>
      </Section>

      <Section title="⏱️ Countdown Timer">
        <RuleRow label="Timer per bid" value="10 seconds" highlight />
        <Divider />
        <Rule>Once the timer reaches zero: <strong className="text-gold">Going once</strong> (2s) → <strong className="text-gold">Going twice</strong> (2s) → drama phase (5s) → <strong className="text-sold">SOLD</strong></Rule>
        <Rule>Any new bid resets the timer to 10 seconds</Rule>
        <Rule>Admin can hammer SOLD early if everyone agrees</Rule>
      </Section>

      <Section title="🏏 General Rules">
        <Rule>Player ruled out mid-tournament — owner's loss, no replacement</Rule>
        <Rule>All 10 teams must have at least 14 players for the auction to close</Rule>
        <Rule>Unsold players may go to re-auction at ₹10L base (admin decides)</Rule>
        <Rule>Fantasy points are calculated on your <strong className="text-white">best XI</strong> each match, subject to the 5 overseas cap</Rule>
      </Section>

    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────

function PointsRules() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Batting */}
        <div className="space-y-4">
          <Section title="🏏 Batting">
            <PointsTable rows={[
              ['Run scored', '+1', 'pos'],
              ['Boundary (4)', '+4', 'pos'],
              ['Six', '+6', 'pos'],
              ['Duck (dismissed for 0)', '−2', 'neg'],
            ]} />
          </Section>

          <Section title="🎯 Run Milestones">
            <PointsTable rows={[
              ['25 runs', '+4', 'pos'],
              ['50 runs', '+8', 'pos'],
              ['75 runs', '+12', 'pos'],
              ['100 runs', '+16', 'pos'],
            ]} note="Milestones are cumulative — a century earns all 4 bonuses (+40 total)" />
          </Section>

          <Section title="💨 Strike Rate (10+ balls)">
            <PointsTable rows={[
              ['Below 50', '−6', 'neg'],
              ['50 – 60', '−4', 'neg'],
              ['60 – 70', '−2', 'neg'],
              ['70 – 130', '0', 'neu'],
              ['130 – 150', '+2', 'pos'],
              ['150 – 170', '+4', 'pos'],
              ['Above 170', '+6', 'pos'],
            ]} />
          </Section>
        </div>

        {/* Bowling + Fielding */}
        <div className="space-y-4">
          <Section title="🎳 Bowling">
            <PointsTable rows={[
              ['Wicket', '+30', 'pos'],
              ['LBW / Bowled bonus (per wicket)', '+8', 'pos'],
              ['Maiden over', '+12', 'pos'],
              ['Dot ball', '+1', 'pos'],
            ]} />
          </Section>

          <Section title="🏆 Wicket Haul Bonus">
            <PointsTable rows={[
              ['3 wickets', '+4', 'pos'],
              ['4 wickets', '+8', 'pos'],
              ['5 wickets', '+12', 'pos'],
            ]} note="Haul bonus stacks on top of per-wicket points" />
          </Section>

          <Section title="📉 Economy Rate (1+ over)">
            <PointsTable rows={[
              ['Below 5', '+6', 'pos'],
              ['5 – 6', '+4', 'pos'],
              ['6 – 7', '+2', 'pos'],
              ['7 – 10', '0', 'neu'],
              ['10 – 11', '−2', 'neg'],
              ['11 – 12', '−4', 'neg'],
              ['Above 12', '−6', 'neg'],
            ]} />
          </Section>

          <Section title="🧤 Fielding">
            <PointsTable rows={[
              ['Catch', '+8', 'pos'],
              ['3-catch bonus', '+4', 'pos'],
              ['Stumping', '+12', 'pos'],
              ['Run out (direct)', '+12', 'pos'],
              ['Run out (indirect)', '+6', 'pos'],
              ['Announced in lineup', '+4', 'pos'],
              ['Substitute fielder', '+4', 'pos'],
            ]} />
          </Section>
        </div>
      </div>

      {/* Quick summary card */}
      <div className="card p-4 bg-gold/5 border-gold/20">
        <div className="font-bold text-gold mb-3 text-sm">💡 Quick Examples</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono text-white/60">
          <div className="bg-bg-deep rounded-lg p-3 space-y-1">
            <div className="text-white font-bold mb-1">Virat Kohli — 82 off 54 (8×4, 3×6)</div>
            <div>Runs: 82 × 1 = <span className="text-sold">+82</span></div>
            <div>Fours: 8 × 4 = <span className="text-sold">+32</span></div>
            <div>Sixes: 3 × 6 = <span className="text-sold">+18</span></div>
            <div>Milestones (25+50+75): <span className="text-sold">+24</span></div>
            <div>SR = 151.8 → 130-150 band: <span className="text-sold">+2</span></div>
            <div className="border-t border-bg-border pt-1 text-gold font-bold">Total: +158 pts</div>
          </div>
          <div className="bg-bg-deep rounded-lg p-3 space-y-1">
            <div className="text-white font-bold mb-1">Jasprit Bumrah — 4/22 in 4 overs</div>
            <div>Wickets: 4 × 30 = <span className="text-sold">+120</span></div>
            <div>2 bowled: 2 × 8 = <span className="text-sold">+16</span></div>
            <div>4-wicket bonus: <span className="text-sold">+8</span></div>
            <div>Dot balls (est. 12): <span className="text-sold">+12</span></div>
            <div>Eco = 5.5 → 5-6 band: <span className="text-sold">+4</span></div>
            <div className="border-t border-bg-border pt-1 text-gold font-bold">Total: +160 pts</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────

function TransferRules() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      <Section title="🔄 When Transfers Open">
        <Rule>Transfer window opens after <strong className="text-gold">7 matches</strong> — admin unlocks it</Rule>
        <Rule>Window stays open until admin closes it (typically end of league stage)</Rule>
        <Rule>You can make unlimited offers while the window is open</Rule>
      </Section>

      <Section title="🤝 How to Make an Offer">
        <Rule>Go to <strong className="text-white">🔄 Transfers</strong> → click <strong className="text-gold">+ New Offer</strong></Rule>
        <Rule>Choose offer type: <strong className="text-white">Direct Trade</strong> (player + optional purse) or <strong className="text-white">Mutual Swap</strong> (players only)</Rule>
        <Rule>Select the team you want to trade with</Rule>
        <Rule>Pick which of <strong className="text-white">your players</strong> you are giving away</Rule>
        <Rule>Pick which of <strong className="text-white">their players</strong> you want in return</Rule>
        <Rule>Optionally add a purse sweetener (Direct Trade only)</Rule>
        <Rule>Add a note to explain the deal — then send</Rule>
      </Section>

      <Section title="✅ Accepting / Rejecting">
        <Rule>The receiving team gets a notification and sees the offer on their Transfers page</Rule>
        <Rule>They can <strong className="text-sold">Accept</strong> or <strong className="text-danger">Reject</strong></Rule>
        <Rule>You can <strong className="text-white">Withdraw</strong> a pending offer at any time</Rule>
        <Rule>If a player involved in a pending offer gets traded elsewhere, that offer is automatically rejected</Rule>
      </Section>

      <Section title="📋 Rules & Constraints">
        <Rule>Both teams must remain within the <strong className="text-gold">7 overseas player limit</strong> after the trade</Rule>
        <Rule>Both teams must have enough <strong className="text-gold">purse</strong> to cover any cash component</Rule>
        <Rule><strong className="text-gold">Historical fantasy points follow the player</strong> — if you trade Bumrah away, his past points go with him</Rule>
        <Rule>Squad limits (min 14, max 17) are not enforced on trades — but keep them in mind</Rule>
        <Rule>Admin can close the transfer window at any time</Rule>
      </Section>

    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// Reusable components

function Section({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 bg-bg-elevated border-b border-bg-border font-bold text-sm text-white/80">
        {title}
      </div>
      <div className="p-4 space-y-2">
        {children}
      </div>
    </div>
  )
}

function RuleRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-bg-border/40 last:border-0">
      <span className="text-sm text-white/60">{label}</span>
      <span className={`font-bold text-sm ${highlight ? 'text-gold' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function Rule({ children }) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/60 py-0.5">
      <span className="text-gold mt-0.5 flex-shrink-0">·</span>
      <span>{children}</span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-bg-border/40 my-1" />
}

function PointsTable({ rows, note }) {
  return (
    <div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-bg-border/30">
          {rows.map(([label, pts, type]) => (
            <tr key={label}>
              <td className="py-1.5 text-white/60 text-xs">{label}</td>
              <td className={`py-1.5 text-right font-bold font-mono text-sm ${
                type === 'pos' ? 'text-sold' : type === 'neg' ? 'text-danger' : 'text-white/30'
              }`}>
                {pts}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="text-xs text-white/25 font-mono mt-2 leading-relaxed">{note}</p>}
    </div>
  )
}
