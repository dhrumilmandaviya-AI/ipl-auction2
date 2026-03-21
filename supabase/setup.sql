-- ============================================================
-- IPL AUCTION — Full Database Setup
-- Run this ONCE in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auction_rooms (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                       TEXT NOT NULL,
  code                       TEXT NOT NULL UNIQUE,
  status                     TEXT NOT NULL DEFAULT 'waiting', -- waiting | active | reauction | closed
  auction_mode               TEXT NOT NULL DEFAULT 'virtual', -- virtual | physical
  admin_team_id              UUID,
  current_auction_player_id  UUID,
  transfer_window_open       BOOLEAN NOT NULL DEFAULT false,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_room_id  UUID NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  purse_remaining  INTEGER NOT NULL DEFAULT 10000,  -- Lakhs (100Cr = 10000L)
  player_count     INTEGER NOT NULL DEFAULT 0,
  foreign_count    INTEGER NOT NULL DEFAULT 0,
  lifelines        INTEGER NOT NULL DEFAULT 3,
  total_points     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  team        TEXT,
  role        TEXT NOT NULL DEFAULT 'BAT',
  nationality TEXT,
  is_foreign  BOOLEAN NOT NULL DEFAULT false,
  base_price  INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS auction_players (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_room_id         UUID NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  player_id               TEXT NOT NULL REFERENCES players(id),
  status                  TEXT NOT NULL DEFAULT 'pending',  -- pending | active | sold | unsold
  current_bid             INTEGER NOT NULL DEFAULT 0,
  current_bidder_team_id  UUID REFERENCES teams(id),
  sold_to_team_id         UUID REFERENCES teams(id),
  final_price             INTEGER,
  last_bid_at             TIMESTAMPTZ,
  order_index             INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bids (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_room_id    UUID NOT NULL REFERENCES auction_rooms(id),
  auction_player_id  UUID NOT NULL REFERENCES auction_players(id),
  team_id            UUID NOT NULL REFERENCES teams(id),
  amount             INTEGER NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_room_id  UUID NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  match_number     INTEGER,
  team1            TEXT,
  team2            TEXT,
  match_date       DATE,
  status           TEXT NOT NULL DEFAULT 'upcoming',  -- upcoming | live | completed
  is_today         BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auction_room_id, name)
);

CREATE TABLE IF NOT EXISTS match_performances (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  auction_room_id  UUID NOT NULL REFERENCES auction_rooms(id),
  player_id        TEXT NOT NULL REFERENCES players(id),
  team_id          UUID NOT NULL REFERENCES teams(id),
  batting          JSONB,
  bowling          JSONB,
  fielding         JSONB,
  did_not_play     BOOLEAN NOT NULL DEFAULT false,
  total_points     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS transfer_offers (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auction_room_id      UUID NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  offering_team_id     UUID NOT NULL REFERENCES teams(id),
  receiving_team_id    UUID NOT NULL REFERENCES teams(id),
  offer_type           TEXT NOT NULL DEFAULT 'direct',  -- direct | swap
  status               TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | withdrawn
  offered_player_ids   TEXT[] NOT NULL DEFAULT '{}',
  offered_purse        INTEGER NOT NULL DEFAULT 0,
  requested_player_ids TEXT[] NOT NULL DEFAULT '{}',
  note                 TEXT,
  counter_offer_id     UUID REFERENCES transfer_offers(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (open — friends-only private app)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auction_rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE players             ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids                ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_performances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_offers     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public" ON auction_rooms       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON teams               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON players             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON auction_players     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON bids               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON matches             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON match_performances  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public" ON transfer_offers     FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE auction_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE auction_players;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE match_performances;
ALTER PUBLICATION supabase_realtime ADD TABLE transfer_offers;

-- ─────────────────────────────────────────────────────────────
-- STORED PROCEDURES
-- ─────────────────────────────────────────────────────────────

-- Place a bid (virtual auction)
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_player_id UUID,
  p_team_id           UUID,
  p_amount            INTEGER,
  p_room_id           UUID
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_current_bid INTEGER; v_current_bidder UUID; v_player_status TEXT;
BEGIN
  SELECT current_bid, current_bidder_team_id, status
  INTO v_current_bid, v_current_bidder, v_player_status
  FROM auction_players WHERE id = p_auction_player_id FOR UPDATE;

  IF v_player_status != 'active' THEN RAISE EXCEPTION 'Player is not up for auction'; END IF;
  IF v_current_bidder = p_team_id THEN RAISE EXCEPTION 'You are already the highest bidder'; END IF;
  IF p_amount <= v_current_bid THEN RAISE EXCEPTION 'Bid must exceed current bid of %', v_current_bid; END IF;

  UPDATE auction_players
  SET current_bid = p_amount, current_bidder_team_id = p_team_id, last_bid_at = NOW()
  WHERE id = p_auction_player_id;

  INSERT INTO bids (auction_room_id, auction_player_id, team_id, amount)
  VALUES (p_room_id, p_auction_player_id, p_team_id, p_amount);
END; $$;

-- Mark sold (virtual — uses highest bid already on record)
CREATE OR REPLACE FUNCTION mark_sold(
  p_auction_player_id UUID,
  p_room_id           UUID
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_team_id UUID; v_bid INTEGER; v_player_id TEXT; v_is_foreign BOOLEAN;
BEGIN
  SELECT current_bidder_team_id, current_bid, player_id
  INTO v_team_id, v_bid, v_player_id
  FROM auction_players WHERE id = p_auction_player_id FOR UPDATE;

  IF v_team_id IS NULL OR v_bid = 0 THEN RAISE EXCEPTION 'No valid bid to confirm'; END IF;
  SELECT is_foreign INTO v_is_foreign FROM players WHERE id = v_player_id;

  UPDATE auction_players
  SET status = 'sold', sold_to_team_id = v_team_id, final_price = v_bid
  WHERE id = p_auction_player_id;

  UPDATE teams
  SET purse_remaining = purse_remaining - v_bid,
      player_count    = player_count + 1,
      foreign_count   = CASE WHEN v_is_foreign THEN foreign_count + 1 ELSE foreign_count END
  WHERE id = v_team_id;

  UPDATE auction_rooms SET current_auction_player_id = NULL
  WHERE id = p_room_id AND current_auction_player_id = p_auction_player_id;
END; $$;

-- Mark sold (physical — admin supplies team + price directly)
CREATE OR REPLACE FUNCTION mark_sold_physical(
  p_auction_player_id UUID,
  p_team_id           UUID,
  p_final_price       INTEGER,
  p_room_id           UUID
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_player_id TEXT; v_is_foreign BOOLEAN;
BEGIN
  SELECT player_id INTO v_player_id FROM auction_players WHERE id = p_auction_player_id FOR UPDATE;
  SELECT is_foreign INTO v_is_foreign FROM players WHERE id = v_player_id;

  UPDATE auction_players
  SET status = 'sold', current_bid = p_final_price,
      current_bidder_team_id = p_team_id, sold_to_team_id = p_team_id,
      final_price = p_final_price, last_bid_at = NOW()
  WHERE id = p_auction_player_id;

  UPDATE teams
  SET purse_remaining = purse_remaining - p_final_price,
      player_count    = player_count + 1,
      foreign_count   = CASE WHEN v_is_foreign THEN foreign_count + 1 ELSE foreign_count END
  WHERE id = p_team_id;

  UPDATE auction_rooms SET current_auction_player_id = NULL
  WHERE id = p_room_id AND current_auction_player_id = p_auction_player_id;

  INSERT INTO bids (auction_room_id, auction_player_id, team_id, amount)
  VALUES (p_room_id, p_auction_player_id, p_team_id, p_final_price);
END; $$;

-- Set a player as active
CREATE OR REPLACE FUNCTION set_active_player(
  p_room_id           UUID,
  p_auction_player_id UUID
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE auction_players SET status = 'pending'
  WHERE auction_room_id = p_room_id AND status = 'active' AND current_bid = 0;

  UPDATE auction_players
  SET status = 'active', current_bid = 0, current_bidder_team_id = NULL, last_bid_at = NULL
  WHERE id = p_auction_player_id;

  UPDATE auction_rooms SET current_auction_player_id = p_auction_player_id WHERE id = p_room_id;
END; $$;

-- Use a lifeline (retract highest bid)
CREATE OR REPLACE FUNCTION use_lifeline(
  p_auction_player_id UUID,
  p_team_id           UUID,
  p_room_id           UUID
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_prev_bid INTEGER; v_prev_bidder UUID;
BEGIN
  IF (SELECT lifelines FROM teams WHERE id = p_team_id) <= 0 THEN
    RAISE EXCEPTION 'No lifelines remaining';
  END IF;
  SELECT amount, team_id INTO v_prev_bid, v_prev_bidder
  FROM bids
  WHERE auction_player_id = p_auction_player_id AND team_id != p_team_id
  ORDER BY amount DESC, created_at DESC LIMIT 1;

  UPDATE teams SET lifelines = lifelines - 1 WHERE id = p_team_id;
  UPDATE auction_players
  SET current_bid = COALESCE(v_prev_bid, 0),
      current_bidder_team_id = v_prev_bidder,
      last_bid_at = CASE WHEN v_prev_bidder IS NOT NULL THEN NOW() ELSE NULL END
  WHERE id = p_auction_player_id;
END; $$;

-- Open re-auction for unsold players at 10L base
CREATE OR REPLACE FUNCTION open_reauction(p_room_id UUID) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE auction_players
  SET status = 'pending', current_bid = 0, current_bidder_team_id = NULL, last_bid_at = NULL
  WHERE auction_room_id = p_room_id AND status = 'unsold';
  UPDATE auction_rooms SET status = 'reauction' WHERE id = p_room_id;
END; $$;

-- Update team fantasy points total
CREATE OR REPLACE FUNCTION update_team_points(p_team_id UUID, p_room_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE teams
  SET total_points = (
    SELECT COALESCE(SUM(total_points), 0) FROM match_performances
    WHERE team_id = p_team_id AND auction_room_id = p_room_id
  )
  WHERE id = p_team_id;
END; $$;

-- Accept a transfer offer (atomic)
CREATE OR REPLACE FUNCTION accept_transfer(p_offer_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_offer transfer_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM transfer_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.status != 'pending' THEN RAISE EXCEPTION 'Offer is no longer pending'; END IF;

  IF EXISTS (SELECT 1 FROM auction_players WHERE id = ANY(v_offer.offered_player_ids::UUID[]) AND sold_to_team_id != v_offer.offering_team_id) THEN
    RAISE EXCEPTION 'Offered players no longer belong to offering team';
  END IF;
  IF EXISTS (SELECT 1 FROM auction_players WHERE id = ANY(v_offer.requested_player_ids::UUID[]) AND sold_to_team_id != v_offer.receiving_team_id) THEN
    RAISE EXCEPTION 'Requested players no longer belong to receiving team';
  END IF;
  IF v_offer.offered_purse > 0 AND (SELECT purse_remaining FROM teams WHERE id = v_offer.offering_team_id) < v_offer.offered_purse THEN
    RAISE EXCEPTION 'Offering team does not have enough purse';
  END IF;

  UPDATE auction_players SET sold_to_team_id = v_offer.receiving_team_id WHERE id = ANY(v_offer.offered_player_ids::UUID[]);
  UPDATE auction_players SET sold_to_team_id = v_offer.offering_team_id WHERE id = ANY(v_offer.requested_player_ids::UUID[]);

  IF v_offer.offered_purse > 0 THEN
    UPDATE teams SET purse_remaining = purse_remaining - v_offer.offered_purse WHERE id = v_offer.offering_team_id;
    UPDATE teams SET purse_remaining = purse_remaining + v_offer.offered_purse WHERE id = v_offer.receiving_team_id;
  END IF;

  UPDATE teams t SET
    player_count  = (SELECT COUNT(*) FROM auction_players WHERE sold_to_team_id = t.id AND status = 'sold'),
    foreign_count = (SELECT COUNT(*) FROM auction_players ap JOIN players p ON ap.player_id = p.id WHERE ap.sold_to_team_id = t.id AND ap.status = 'sold' AND p.is_foreign = true)
  WHERE t.id IN (v_offer.offering_team_id, v_offer.receiving_team_id);

  UPDATE match_performances SET team_id = v_offer.receiving_team_id
  WHERE auction_room_id = v_offer.auction_room_id
    AND player_id IN (SELECT p.player_id FROM auction_players p WHERE p.id = ANY(v_offer.offered_player_ids::UUID[]));
  UPDATE match_performances SET team_id = v_offer.offering_team_id
  WHERE auction_room_id = v_offer.auction_room_id
    AND player_id IN (SELECT p.player_id FROM auction_players p WHERE p.id = ANY(v_offer.requested_player_ids::UUID[]));

  UPDATE teams SET total_points = (
    SELECT COALESCE(SUM(total_points), 0) FROM match_performances WHERE team_id = teams.id AND auction_room_id = v_offer.auction_room_id
  ) WHERE id IN (v_offer.offering_team_id, v_offer.receiving_team_id);

  UPDATE transfer_offers SET status = 'accepted', updated_at = NOW() WHERE id = p_offer_id;
  UPDATE transfer_offers SET status = 'rejected', updated_at = NOW()
  WHERE id != p_offer_id AND auction_room_id = v_offer.auction_room_id AND status = 'pending'
    AND (offered_player_ids && v_offer.offered_player_ids OR offered_player_ids && v_offer.requested_player_ids
      OR requested_player_ids && v_offer.offered_player_ids OR requested_player_ids && v_offer.requested_player_ids);
END; $$;

-- ─────────────────────────────────────────────────────────────
-- SEED: IPL 2025 Players
-- ─────────────────────────────────────────────────────────────

INSERT INTO players (id, name, team, role, nationality, is_foreign, base_price) VALUES
('p001','Virat Kohli','RCB','BAT','India',false,20),
('p002','Rohit Sharma','MI','BAT','India',false,20),
('p003','Yashasvi Jaiswal','RR','BAT','India',false,20),
('p004','Shubman Gill','GT','BAT','India',false,20),
('p005','Ruturaj Gaikwad','CSK','BAT','India',false,20),
('p006','Suryakumar Yadav','MI','BAT','India',false,20),
('p007','Tilak Varma','MI','BAT','India',false,20),
('p008','Rajat Patidar','RCB','BAT','India',false,20),
('p009','Abhishek Sharma','SRH','AR','India',false,20),
('p010','Sai Sudharsan','GT','BAT','India',false,20),
('p011','Riyan Parag','RR','AR','India',false,20),
('p012','Rinku Singh','KKR','BAT','India',false,20),
('p013','Venkatesh Iyer','KKR','AR','India',false,20),
('p014','Shashank Singh','PBKS','BAT','India',false,20),
('p015','Angkrish Raghuvanshi','KKR','BAT','India',false,20),
('p016','Ayush Badoni','LSG','BAT','India',false,20),
('p017','Shahrukh Khan','GT','BAT','India',false,20),
('p018','Sameer Rizvi','DC','BAT','India',false,20),
('p019','Musheer Khan','PBKS','BAT','India',false,20),
('p020','Naman Dhir','MI','BAT','India',false,20),
('p021','Rishabh Pant','LSG','WK','India',false,20),
('p022','Sanju Samson','RR','WK','India',false,20),
('p023','KL Rahul','DC','WK','India',false,20),
('p024','Ishan Kishan','SRH','WK','India',false,20),
('p025','Prabhsimran Singh','PBKS','WK','India',false,20),
('p026','Dhruv Jurel','RR','WK','India',false,20),
('p027','Abishek Porel','DC','WK','India',false,20),
('p028','Robin Minz','MI','WK','India',false,20),
('p029','Wriddhiman Saha','GT','WK','India',false,20),
('p030','Hardik Pandya','MI','AR','India',false,20),
('p031','Ravindra Jadeja','CSK','AR','India',false,20),
('p032','Axar Patel','DC','AR','India',false,20),
('p033','Krunal Pandya','RCB','AR','India',false,20),
('p034','Shivam Dube','CSK','AR','India',false,20),
('p035','Nitish Kumar Reddy','SRH','AR','India',false,20),
('p036','Washington Sundar','GT','AR','India',false,20),
('p037','Deepak Hooda','CSK','AR','India',false,20),
('p038','Harpreet Brar','PBKS','AR','India',false,20),
('p039','Jasprit Bumrah','MI','BWL','India',false,20),
('p040','Mohammed Shami','SRH','BWL','India',false,20),
('p041','Kuldeep Yadav','DC','BWL','India',false,20),
('p042','Yuzvendra Chahal','RR','BWL','India',false,20),
('p043','Ravi Bishnoi','LSG','BWL','India',false,20),
('p044','Varun Chakravarthy','KKR','BWL','India',false,20),
('p045','Arshdeep Singh','PBKS','BWL','India',false,20),
('p046','Mohammed Siraj','RCB','BWL','India',false,20),
('p047','Yash Dayal','RCB','BWL','India',false,20),
('p048','Harshal Patel','SRH','BWL','India',false,20),
('p049','Harshit Rana','KKR','BWL','India',false,20),
('p050','T Natarajan','DC','BWL','India',false,20),
('p051','Mayank Yadav','LSG','BWL','India',false,20),
('p052','Deepak Chahar','MI','BWL','India',false,20),
('p053','Khaleel Ahmed','CSK','BWL','India',false,20),
('p054','Sandeep Sharma','RR','BWL','India',false,20),
('p055','Prasidh Krishna','GT','BWL','India',false,20),
('p056','Mohsin Khan','LSG','BWL','India',false,20),
('p057','Bhuvneshwar Kumar','RCB','BWL','India',false,20),
('p058','Mukesh Choudhary','CSK','BWL','India',false,20),
('p059','Jaydev Unadkat','SRH','BWL','India',false,20),
('p060','Kumar Kartikeya','RR','BWL','India',false,20),
('p061','Akash Madhwal','LSG','BWL','India',false,20),
('p062','Zeeshan Ansari','SRH','BWL','India',false,20),
('p063','Travis Head','SRH','BAT','Australia',true,20),
('p064','Jos Buttler','RR','WK','England',true,20),
('p065','Heinrich Klaasen','SRH','WK','South Africa',true,20),
('p066','Phil Salt','RCB','WK','England',true,20),
('p067','Quinton de Kock','KKR','WK','South Africa',true,20),
('p068','Ryan Rickelton','MI','WK','South Africa',true,20),
('p069','Devon Conway','CSK','WK','New Zealand',true,20),
('p070','Josh Inglis','PBKS','WK','Australia',true,20),
('p071','Nicholas Pooran','LSG','WK','West Indies',true,20),
('p072','Jake Fraser-McGurk','DC','BAT','Australia',true,20),
('p073','Shimron Hetmyer','RR','BAT','West Indies',true,20),
('p074','David Miller','GT','BAT','South Africa',true,20),
('p075','Tim David','RCB','BAT','Singapore',true,20),
('p076','Kane Williamson','GT','BAT','New Zealand',true,20),
('p077','Tristan Stubbs','DC','BAT','South Africa',true,20),
('p078','Andre Russell','KKR','AR','West Indies',true,20),
('p079','Sunil Narine','KKR','AR','West Indies',true,20),
('p080','Liam Livingstone','RCB','AR','England',true,20),
('p081','Glenn Maxwell','PBKS','AR','Australia',true,20),
('p082','Mitchell Marsh','DC','AR','Australia',true,20),
('p083','Pat Cummins','SRH','AR','Australia',true,20),
('p084','Rachin Ravindra','CSK','AR','New Zealand',true,20),
('p085','Jacob Bethell','RCB','AR','England',true,20),
('p086','Marco Jansen','PBKS','AR','South Africa',true,20),
('p087','Will Jacks','MI','AR','England',true,20),
('p088','Rashid Khan','GT','BWL','Afghanistan',true,20),
('p089','Trent Boult','RR','BWL','New Zealand',true,20),
('p090','Josh Hazlewood','RCB','BWL','Australia',true,20),
('p091','Mitchell Starc','KKR','BWL','Australia',true,20),
('p092','Adam Zampa','SRH','BWL','Australia',true,20),
('p093','Nandre Burger','RR','BWL','South Africa',true,20),
('p094','Alzarri Joseph','GT','BWL','West Indies',true,20),
('p095','Matheesha Pathirana','CSK','BWL','Sri Lanka',true,20),
('p096','Noor Ahmad','GT','BWL','Afghanistan',true,20),
('p097','Spencer Johnson','KKR','BWL','Australia',true,20),
('p098','Anrich Nortje','DC','BWL','South Africa',true,20),
('p099','Faf du Plessis','DC','BAT','South Africa',true,20),
('p100','Devdutt Padikkal','CSK','BAT','India',false,20),
('p101','Abdul Samad','SRH','BAT','India',false,20),
('p102','Rilee Rossouw','SRH','BAT','South Africa',true,20)
ON CONFLICT (id) DO NOTHING;
