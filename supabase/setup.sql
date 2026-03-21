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
-- IPL 2026 Complete Players Seed (250 players)
INSERT INTO players (id, name, team, role, nationality, is_foreign, base_price) VALUES
('p001','MS Dhoni','CSK','WK','India',false,20),
('p002','Ruturaj Gaikwad','CSK','BAT','India',false,20),
('p003','Sanju Samson','CSK','WK','India',false,20),
('p004','Ayush Mhatre','CSK','BAT','India',false,20),
('p005','Dewald Brevis','CSK','BAT','South Africa',true,20),
('p006','Shivam Dube','CSK','AR','India',false,20),
('p007','Urvil Patel','CSK','WK','India',false,20),
('p008','Noor Ahmad','CSK','BWL','Afghanistan',true,20),
('p009','Nathan Ellis','CSK','BWL','Australia',true,20),
('p010','Shreyas Gopal','CSK','BWL','India',false,20),
('p011','Khaleel Ahmed','CSK','BWL','India',false,20),
('p012','Ramakrishna Ghosh','CSK','BWL','India',false,20),
('p013','Mukesh Choudhary','CSK','BWL','India',false,20),
('p014','Jamie Overton','CSK','AR','England',true,20),
('p015','Gurjapneet Singh','CSK','BWL','India',false,20),
('p016','Anshul Kamboj','CSK','BWL','India',false,20),
('p017','Prashant Veer','CSK','BWL','India',false,20),
('p018','Kartik Sharma','CSK','AR','India',false,20),
('p019','Rahul Chahar','CSK','BWL','India',false,20),
('p020','Akeal Hosein','CSK','BWL','West Indies',true,20),
('p021','Matt Henry','CSK','BWL','New Zealand',true,20),
('p022','Matthew Short','CSK','AR','Australia',true,20),
('p023','Sarfaraz Khan','CSK','BAT','India',false,20),
('p024','Zak Foulkes','CSK','BWL','England',true,20),
('p025','Aman Khan','CSK','BWL','India',false,20),
('p026','KL Rahul','DC','WK','India',false,20),
('p027','Abishek Porel','DC','WK','India',false,20),
('p028','Axar Patel','DC','AR','India',false,20),
('p029','Mitchell Starc','DC','BWL','Australia',true,20),
('p030','Kuldeep Yadav','DC','BWL','India',false,20),
('p031','Tristan Stubbs','DC','BAT','South Africa',true,20),
('p032','Sameer Rizvi','DC','BAT','India',false,20),
('p033','T Natarajan','DC','BWL','India',false,20),
('p034','Nitish Rana','DC','BAT','India',false,20),
('p035','Karun Nair','DC','BAT','India',false,20),
('p036','Ashutosh Sharma','DC','AR','India',false,20),
('p037','Dushmantha Chameera','DC','BWL','Sri Lanka',true,20),
('p038','Madhav Tiwari','DC','BWL','India',false,20),
('p039','Tripurana Vijay','DC','BAT','India',false,20),
('p040','Vipraj Nigam','DC','BWL','India',false,20),
('p041','Mukesh Kumar','DC','BWL','India',false,20),
('p042','Ajay Mandal','DC','AR','India',false,20),
('p043','Auqib Nabi Dar','DC','BWL','India',false,20),
('p044','Pathum Nissanka','DC','BAT','Sri Lanka',true,20),
('p045','David Miller','DC','BAT','South Africa',true,20),
('p046','Ben Duckett','DC','BAT','England',true,20),
('p047','Lungi Ngidi','DC','BWL','South Africa',true,20),
('p048','Kyle Jamieson','DC','AR','New Zealand',true,20),
('p049','Prithvi Shaw','DC','BAT','India',false,20),
('p050','Sahil Parikh','DC','BWL','India',false,20),
('p051','Shubman Gill','GT','BAT','India',false,20),
('p052','Sai Sudharsan','GT','BAT','India',false,20),
('p053','Jos Buttler','GT','WK','England',true,20),
('p054','Rashid Khan','GT','BWL','Afghanistan',true,20),
('p055','Mohammed Siraj','GT','BWL','India',false,20),
('p056','Washington Sundar','GT','AR','India',false,20),
('p057','Prasidh Krishna','GT','BWL','India',false,20),
('p058','Shahrukh Khan','GT','BAT','India',false,20),
('p059','Rahul Tewatia','GT','AR','India',false,20),
('p060','Kagiso Rabada','GT','BWL','South Africa',true,20),
('p061','Glenn Phillips','GT','AR','New Zealand',true,20),
('p062','Anuj Rawat','GT','WK','India',false,20),
('p063','Gurnoor Brar','GT','BWL','India',false,20),
('p064','Ishant Sharma','GT','BWL','India',false,20),
('p065','Jayant Yadav','GT','AR','India',false,20),
('p066','Kumar Kushagra','GT','WK','India',false,20),
('p067','Manav Suthar','GT','BWL','India',false,20),
('p068','Arshad Khan','GT','BWL','India',false,20),
('p069','Nishant Sindhu','GT','AR','India',false,20),
('p070','R Sai Kishore','GT','BWL','India',false,20),
('p071','Jason Holder','GT','AR','West Indies',true,20),
('p072','Tom Banton','GT','WK','England',true,20),
('p073','Ashok Sharma','GT','BWL','India',false,20),
('p074','Luke Wood','GT','BWL','England',true,20),
('p075','Prithvi Raj','GT','BWL','India',false,20),
('p076','Sunil Narine','KKR','AR','West Indies',true,20),
('p077','Varun Chakravarthy','KKR','BWL','India',false,20),
('p078','Rinku Singh','KKR','BAT','India',false,20),
('p079','Harshit Rana','KKR','BWL','India',false,20),
('p080','Angkrish Raghuvanshi','KKR','BAT','India',false,20),
('p081','Matheesha Pathirana','KKR','BWL','Sri Lanka',true,20),
('p082','Cameron Green','KKR','AR','Australia',true,20),
('p083','Rachin Ravindra','KKR','AR','New Zealand',true,20),
('p084','Rovman Powell','KKR','BAT','West Indies',true,20),
('p085','Ajinkya Rahane','KKR','BAT','India',false,20),
('p086','Anukul Roy','KKR','AR','India',false,20),
('p087','Manish Pandey','KKR','BAT','India',false,20),
('p088','Ramandeep Singh','KKR','AR','India',false,20),
('p089','Umran Malik','KKR','BWL','India',false,20),
('p090','Vaibhav Arora','KKR','BWL','India',false,20),
('p091','Mustafizur Rahman','KKR','BWL','Bangladesh',true,20),
('p092','Finn Allen','KKR','WK','New Zealand',true,20),
('p093','Tim Seifert','KKR','WK','New Zealand',true,20),
('p094','Akash Deep','KKR','BWL','India',false,20),
('p095','Rahul Tripathi','KKR','BAT','India',false,20),
('p096','Tejasvi Singh','KKR','BAT','India',false,20),
('p097','Prashant Solanki','KKR','BWL','India',false,20),
('p098','Kartik Tyagi','KKR','BWL','India',false,20),
('p099','Sarthak Ranjan','KKR','WK','India',false,20),
('p100','Daksh Kamra','KKR','BAT','India',false,20),
('p101','Rishabh Pant','LSG','WK','India',false,20),
('p102','Nicholas Pooran','LSG','WK','West Indies',true,20),
('p103','Mitchell Marsh','LSG','AR','Australia',true,20),
('p104','Mohammed Shami','LSG','BWL','India',false,20),
('p105','Mayank Yadav','LSG','BWL','India',false,20),
('p106','Aiden Markram','LSG','AR','South Africa',true,20),
('p107','Ayush Badoni','LSG','BAT','India',false,20),
('p108','Mohsin Khan','LSG','BWL','India',false,20),
('p109','Avesh Khan','LSG','BWL','India',false,20),
('p110','Abdul Samad','LSG','BAT','India',false,20),
('p111','Anrich Nortje','LSG','BWL','South Africa',true,20),
('p112','Josh Inglis','LSG','WK','Australia',true,20),
('p113','Wanindu Hasaranga','LSG','AR','Sri Lanka',true,20),
('p114','Matthew Breetzke','LSG','BAT','South Africa',true,20),
('p115','Akash Singh','LSG','BWL','India',false,20),
('p116','Arjun Tendulkar','LSG','AR','India',false,20),
('p117','Arshin Kulkarni','LSG','AR','India',false,20),
('p118','Digvesh Rathi','LSG','BWL','India',false,20),
('p119','Himmat Singh','LSG','BAT','India',false,20),
('p120','Manimaran Siddharth','LSG','BWL','India',false,20),
('p121','Shahbaz Ahmed','LSG','AR','India',false,20),
('p122','Prince Yadav','LSG','BAT','India',false,20),
('p123','Akshat Raghuwanshi','LSG','BAT','India',false,20),
('p124','Mukul Choudhary','LSG','BWL','India',false,20),
('p125','Naman Tiwari','LSG','BWL','India',false,20),
('p126','Rohit Sharma','MI','BAT','India',false,20),
('p127','Suryakumar Yadav','MI','BAT','India',false,20),
('p128','Hardik Pandya','MI','AR','India',false,20),
('p129','Jasprit Bumrah','MI','BWL','India',false,20),
('p130','Tilak Varma','MI','BAT','India',false,20),
('p131','Ryan Rickelton','MI','WK','South Africa',true,20),
('p132','Trent Boult','MI','BWL','New Zealand',true,20),
('p133','Will Jacks','MI','AR','England',true,20),
('p134','Naman Dhir','MI','BAT','India',false,20),
('p135','Robin Minz','MI','WK','India',false,20),
('p136','Deepak Chahar','MI','BWL','India',false,20),
('p137','Quinton de Kock','MI','WK','South Africa',true,20),
('p138','Sherfane Rutherford','MI','AR','West Indies',true,20),
('p139','Shardul Thakur','MI','AR','India',false,20),
('p140','Mitchell Santner','MI','AR','New Zealand',true,20),
('p141','Corbin Bosch','MI','AR','South Africa',true,20),
('p142','Mayank Markande','MI','BWL','India',false,20),
('p143','Raghu Sharma','MI','BWL','India',false,20),
('p144','Raj Bawa','MI','AR','India',false,20),
('p145','AM Ghazanfar','MI','BWL','Afghanistan',true,20),
('p146','Ashwani Kumar','MI','BWL','India',false,20),
('p147','Atharva Ankolekar','MI','AR','India',false,20),
('p148','Mohammad Izhar','MI','BWL','India',false,20),
('p149','Danish Malewar','MI','BAT','India',false,20),
('p150','Mayank Rawat','MI','BAT','India',false,20),
('p151','Shreyas Iyer','PBKS','BAT','India',false,20),
('p152','Prabhsimran Singh','PBKS','WK','India',false,20),
('p153','Arshdeep Singh','PBKS','BWL','India',false,20),
('p154','Yuzvendra Chahal','PBKS','BWL','India',false,20),
('p155','Shashank Singh','PBKS','BAT','India',false,20),
('p156','Marco Jansen','PBKS','AR','South Africa',true,20),
('p157','Marcus Stoinis','PBKS','AR','Australia',true,20),
('p158','Musheer Khan','PBKS','BAT','India',false,20),
('p159','Harpreet Brar','PBKS','AR','India',false,20),
('p160','Lockie Ferguson','PBKS','BWL','New Zealand',true,20),
('p161','Priyansh Arya','PBKS','BAT','India',false,20),
('p162','Nehal Wadhera','PBKS','BAT','India',false,20),
('p163','Mitch Owen','PBKS','BAT','Australia',true,20),
('p164','Xavier Bartlett','PBKS','BWL','Australia',true,20),
('p165','Azmatullah Omarzai','PBKS','AR','Afghanistan',true,20),
('p166','Harnoor Singh Pannu','PBKS','BAT','India',false,20),
('p167','Pyla Avinash','PBKS','BWL','India',false,20),
('p168','Suryansh Shedge','PBKS','BAT','India',false,20),
('p169','Vishnu Vinod','PBKS','WK','India',false,20),
('p170','Vyshak Vijaykumar','PBKS','BWL','India',false,20),
('p171','Yash Thakur','PBKS','BWL','India',false,20),
('p172','Ben Dwarshuis','PBKS','BWL','Australia',true,20),
('p173','Cooper Connolly','PBKS','AR','Australia',true,20),
('p174','Vishal Nishad','PBKS','BWL','India',false,20),
('p175','Pravin Dubey','PBKS','BWL','India',false,20),
('p176','Yashasvi Jaiswal','RR','BAT','India',false,20),
('p177','Riyan Parag','RR','AR','India',false,20),
('p178','Ravindra Jadeja','RR','AR','India',false,20),
('p179','Shimron Hetmyer','RR','BAT','West Indies',true,20),
('p180','Dhruv Jurel','RR','WK','India',false,20),
('p181','Ravi Bishnoi','RR','BWL','India',false,20),
('p182','Sandeep Sharma','RR','BWL','India',false,20),
('p183','Nandre Burger','RR','BWL','South Africa',true,20),
('p184','Jofra Archer','RR','BWL','England',true,20),
('p185','Sam Curran','RR','AR','England',true,20),
('p186','Vaibhav Suryavanshi','RR','BAT','India',false,20),
('p187','Donovan Ferreira','RR','BAT','South Africa',true,20),
('p188','Kwena Maphaka','RR','BWL','South Africa',true,20),
('p189','Lhuan-Dre Pretorius','RR','BAT','South Africa',true,20),
('p190','Tushar Deshpande','RR','BWL','India',false,20),
('p191','Shubham Dubey','RR','AR','India',false,20),
('p192','Yudhvir Singh Charak','RR','BWL','India',false,20),
('p193','Adam Milne','RR','BWL','New Zealand',true,20),
('p194','Ravi Singh','RR','BWL','India',false,20),
('p195','Sushant Mishra','RR','BWL','India',false,20),
('p196','Kuldeep Sen','RR','BWL','India',false,20),
('p197','Vignesh Puthur','RR','BWL','India',false,20),
('p198','Yash Punja','RR','BWL','India',false,20),
('p199','Aman Rao','RR','BAT','India',false,20),
('p200','Brijesh Sharma','RR','BWL','India',false,20),
('p201','Virat Kohli','RCB','BAT','India',false,20),
('p202','Rajat Patidar','RCB','BAT','India',false,20),
('p203','Phil Salt','RCB','WK','England',true,20),
('p204','Tim David','RCB','BAT','Singapore',true,20),
('p205','Krunal Pandya','RCB','AR','India',false,20),
('p206','Bhuvneshwar Kumar','RCB','BWL','India',false,20),
('p207','Yash Dayal','RCB','BWL','India',false,20),
('p208','Josh Hazlewood','RCB','BWL','Australia',true,20),
('p209','Jacob Bethell','RCB','AR','England',true,20),
('p210','Devdutt Padikkal','RCB','BAT','India',false,20),
('p211','Jitesh Sharma','RCB','WK','India',false,20),
('p212','Venkatesh Iyer','RCB','AR','India',false,20),
('p213','Nuwan Thushara','RCB','BWL','Sri Lanka',true,20),
('p214','Romario Shepherd','RCB','AR','West Indies',true,20),
('p215','Suyash Sharma','RCB','BWL','India',false,20),
('p216','Rasikh Dar','RCB','BWL','India',false,20),
('p217','Swapnil Singh','RCB','AR','India',false,20),
('p218','Abhinandan Singh','RCB','BWL','India',false,20),
('p219','Mangesh Yadav','RCB','BWL','India',false,20),
('p220','Jacob Duffy','RCB','BWL','New Zealand',true,20),
('p221','Jordan Cox','RCB','WK','England',true,20),
('p222','Satvik Deswal','RCB','WK','India',false,20),
('p223','Vicky Ostwal','RCB','BWL','India',false,20),
('p224','Vihaan Malhotra','RCB','BAT','India',false,20),
('p225','Kanishk Chouhan','RCB','BWL','India',false,20),
('p226','Travis Head','SRH','BAT','Australia',true,20),
('p227','Heinrich Klaasen','SRH','WK','South Africa',true,20),
('p228','Pat Cummins','SRH','AR','Australia',true,20),
('p229','Abhishek Sharma','SRH','AR','India',false,20),
('p230','Nitish Kumar Reddy','SRH','AR','India',false,20),
('p231','Liam Livingstone','SRH','AR','England',true,20),
('p232','Harshal Patel','SRH','BWL','India',false,20),
('p233','Ishan Kishan','SRH','WK','India',false,20),
('p234','Zeeshan Ansari','SRH','BWL','India',false,20),
('p235','Jaydev Unadkat','SRH','BWL','India',false,20),
('p236','Kamindu Mendis','SRH','AR','Sri Lanka',true,20),
('p237','Brydon Carse','SRH','AR','England',true,20),
('p238','Aniket Verma','SRH','BAT','India',false,20),
('p239','Harsh Dubey','SRH','BWL','India',false,20),
('p240','R Smaran','SRH','BAT','India',false,20),
('p241','Eshan Malinga','SRH','BWL','India',false,20),
('p242','Jack Edwards','SRH','AR','Australia',true,20),
('p243','Salil Arora','SRH','BWL','India',false,20),
('p244','Shivam Mavi','SRH','BWL','India',false,20),
('p245','Shivang Kumar','SRH','BWL','India',false,20),
('p246','Krains Fuletra','SRH','BWL','India',false,20),
('p247','Praful Hinge','SRH','BWL','India',false,20),
('p248','Amit Kumar','SRH','BWL','India',false,20),
('p249','Onkar Tarmale','SRH','BWL','India',false,20),
('p250','Sakib Hussain','SRH','BWL','India',false,20)
ON CONFLICT (id) DO UPDATE SET team = EXCLUDED.team, role = EXCLUDED.role, nationality = EXCLUDED.nationality, is_foreign = EXCLUDED.is_foreign;
