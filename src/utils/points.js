// ============================================================
// Fantasy Points Calculation — Updated Rules
// ============================================================

export function calculateBattingPoints(stats) {
  if (!stats || stats.did_not_bat) return 0
  let pts = 0
  const { runs = 0, balls = 0, fours = 0, sixes = 0, dismissed = false } = stats

  pts += runs * 1
  pts += fours * 4
  pts += sixes * 6

  if (dismissed && runs === 0) pts -= 2

  if (runs >= 25)  pts += 4
  if (runs >= 50)  pts += 8
  if (runs >= 75)  pts += 12
  if (runs >= 100) pts += 16

  if (balls >= 10) {
    const sr = (runs / balls) * 100
    if      (sr < 50)   pts -= 6
    else if (sr < 60)   pts -= 4
    else if (sr < 70)   pts -= 2
    else if (sr <= 130) pts += 0
    else if (sr <= 150) pts += 2
    else if (sr <= 170) pts += 4
    else                pts += 6
  }

  return pts
}

export function calculateBowlingPoints(stats) {
  if (!stats || stats.did_not_bowl) return 0
  let pts = 0
  const {
    wickets = 0, maidens = 0, dot_balls = 0,
    runs_conceded = 0, overs = 0,
    lbw_bowled_wickets = 0,
  } = stats

  pts += wickets * 30
  pts += lbw_bowled_wickets * 8

  if      (wickets >= 5) pts += 12
  else if (wickets >= 4) pts += 8
  else if (wickets >= 3) pts += 4

  pts += maidens * 12
  pts += dot_balls * 1

  if (overs >= 1) {
    const eco = runs_conceded / overs
    if      (eco < 5)   pts += 6
    else if (eco < 6)   pts += 4
    else if (eco < 7)   pts += 2
    else if (eco <= 10) pts += 0
    else if (eco <= 11) pts -= 2
    else if (eco <= 12) pts -= 4
    else                pts -= 6
  }

  return pts
}

export function calculateFieldingPoints(stats) {
  if (!stats) return 0
  let pts = 0
  const {
    catches = 0,
    stumpings = 0,
    run_out_direct = 0,
    run_out_indirect = 0,
  } = stats

  pts += catches * 8
  if (catches >= 3) pts += 4
  pts += stumpings * 12
  pts += run_out_direct * 12
  pts += run_out_indirect * 6

  return pts
}

// Separate function for playing XI / substitute points
export function calculatePlayingPoints(performance) {
  if (!performance) return 0
  if (performance.did_not_play) return 0
  let pts = 0
  if (performance.in_lineup)    pts += 4
  if (performance.is_substitute) pts += 4
  return pts
}

export function calculateTotalPoints(performance) {
  if (!performance) return 0
  if (performance.did_not_play) return 0

  return (
    calculateBattingPoints(performance.batting) +
    calculateBowlingPoints(performance.bowling) +
    calculateFieldingPoints(performance.fielding) +
    calculatePlayingPoints(performance)
  )
}

export function buildScorecardPrompt(scorecardText, playerNames) {
  return `Parse this IPL scorecard for these players: ${playerNames.join(', ')}

Scorecard: ${scorecardText}

Return ONLY a JSON array. No markdown. Start with [ end with ].
[{
  "player_name": "Name",
  "did_not_play": false,
  "in_lineup": true,
  "is_substitute": false,
  "batting": { "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "dismissed": true },
  "bowling": { "overs": 0, "runs_conceded": 0, "wickets": 0, "maidens": 0, "dot_balls": 0, "lbw_bowled_wickets": 0 },
  "fielding": { "catches": 0, "stumpings": 0, "run_out_direct": 0, "run_out_indirect": 0 }
}]`
}
