/**
 * Fantasy Points Calculation System
 * All rules as specified by user
 */

export function calculateBattingPoints(stats) {
  if (!stats || stats.did_not_bat) return 0
  let pts = 0
  const { runs = 0, balls = 0, fours = 0, sixes = 0, dismissed = false } = stats

  // Runs scored: 1 point each
  pts += runs

  // Boundary bonus: 4 → +1, 6 → +3
  pts += fours * 1
  pts += sixes * 3

  // Duck out (dismissed for 0)
  if (dismissed && runs === 0) pts -= 2

  // Run milestones
  if (runs >= 100) pts += 8
  else if (runs >= 50) pts += 6
  else if (runs >= 30) pts += 4

  // Strike rate (only if 10+ balls faced)
  if (balls >= 10) {
    const sr = (runs / balls) * 100
    if (sr < 50)           pts -= 4
    else if (sr < 70)      pts -= 2
    else if (sr <= 130)    pts += 0
    else if (sr <= 150)    pts += 2
    else if (sr <= 200)    pts += 4
    else                   pts += 6
  }

  return pts
}

export function calculateBowlingPoints(stats) {
  if (!stats || stats.did_not_bowl) return 0
  let pts = 0
  const {
    wickets = 0, maidens = 0, dot_balls = 0,
    wides = 0, no_balls = 0, runs_conceded = 0, overs = 0
  } = stats

  // Per wicket: 15 pts
  pts += wickets * 15

  // Maiden: 12 pts each
  pts += maidens * 12

  // Dot ball: 1 pt each
  pts += dot_balls * 1

  // Extras penalty
  pts -= wides * 2
  pts -= no_balls * 5

  // Wicket haul bonus
  if (wickets >= 5)      pts += 12
  else if (wickets >= 4) pts += 8
  else if (wickets >= 3) pts += 4

  // Economy rate bonus (only if bowled 1+ over)
  if (overs >= 1) {
    const eco = runs_conceded / overs
    if (eco < 5)         pts += 6
    else if (eco < 7)    pts += 2
    else if (eco <= 10)  pts += 0
    else if (eco <= 12)  pts -= 2
    else                 pts -= 6
  }

  return pts
}

export function calculateFieldingPoints(stats) {
  if (!stats) return 0
  let pts = 0
  const { catches = 0, runouts = 0, stumpings = 0 } = stats

  // Catch: 8 pts each
  pts += catches * 8

  // 3-catch bonus: +4
  if (catches >= 3) pts += 4

  // Run out: 6 pts each
  pts += runouts * 6

  // Stumping: 6 pts each
  pts += stumpings * 6

  return pts
}

export function calculateTotalPoints(performance) {
  if (!performance) return 0
  if (performance.did_not_play) return 0

  const batting  = calculateBattingPoints(performance)
  const bowling  = calculateBowlingPoints(performance)
  const fielding = calculateFieldingPoints(performance)

  return batting + bowling + fielding
}

export function calculateTeamPoints(teamPlayers, allPerformances, matchId) {
  // teamPlayers: array of player objects with id
  // allPerformances: array of performance objects for this match
  // Returns top 11 players by points (max 5 foreign in XI)

  const matchPerfs = allPerformances.filter(p => !matchId || p.match_id === matchId)

  const withPoints = teamPlayers.map(player => {
    const perf = matchPerfs.find(p => p.player_id === player.id)
    return {
      ...player,
      points: calculateTotalPoints(perf),
      performance: perf,
    }
  })

  // Sort by points descending, then apply foreign player limit (max 5 in XI)
  withPoints.sort((a, b) => b.points - a.points)

  const xi = []
  let foreignCount = 0
  for (const player of withPoints) {
    if (xi.length >= 11) break
    if (player.is_foreign) {
      if (foreignCount >= 5) continue
      foreignCount++
    }
    xi.push(player)
  }

  // If we got fewer than 11, fill from remaining players (foreign limit might exclude some)
  if (xi.length < 11) {
    const xiIds = new Set(xi.map(p => p.id))
    for (const player of withPoints) {
      if (xi.length >= 11) break
      if (!xiIds.has(player.id)) xi.push(player)
    }
  }

  return {
    xi,
    totalPoints: xi.reduce((sum, p) => sum + p.points, 0),
    breakdown: withPoints,
  }
}

/** Parse Claude API scorecard response into structured performance data */
export function buildScorecardPrompt(scorecardText, playerNames) {
  return `You are a cricket scorecard parser. Parse the following IPL match scorecard and extract performance data for each player.

Known players to look for: ${playerNames.join(', ')}

Scorecard:
${scorecardText}

Return ONLY a JSON array (no markdown, no backticks) with this structure for each player found:
[
  {
    "player_name": "Exact name from scorecard",
    "did_not_play": false,
    "batting": {
      "runs": 0,
      "balls": 0,
      "fours": 0,
      "sixes": 0,
      "dismissed": true
    },
    "bowling": {
      "overs": 0,
      "runs_conceded": 0,
      "wickets": 0,
      "maidens": 0,
      "dot_balls": 0,
      "wides": 0,
      "no_balls": 0
    },
    "fielding": {
      "catches": 0,
      "runouts": 0,
      "stumpings": 0
    }
  }
]

Rules:
- If a player did not bat, set batting to null
- If a player did not bowl, set bowling to null  
- If player is not in the scorecard at all, set did_not_play to true
- Estimate dot balls from overs * 6 - (non-dot deliveries) if not explicitly stated
- Include ALL players from the known list, marking absent ones as did_not_play: true`
}
