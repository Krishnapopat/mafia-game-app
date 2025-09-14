-- Create tables for the Mafia game
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table for user profiles
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES players(id),
  name TEXT NOT NULL,
  max_players INTEGER DEFAULT 10,
  current_players INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'night', 'day', 'voting', 'finished')),
  current_phase TEXT DEFAULT 'lobby',
  phase_end_time TIMESTAMP WITH TIME ZONE,
  day_number INTEGER DEFAULT 0,
  winner TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game participants table
CREATE TABLE IF NOT EXISTS game_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  role TEXT NOT NULL CHECK (role IN ('villager', 'mafia', 'doctor', 'detective', 'jester', 'bandit')),
  is_alive BOOLEAN DEFAULT TRUE,
  is_host BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, player_id)
);

-- Game actions table (votes, night actions, etc.)
CREATE TABLE IF NOT EXISTS game_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('vote', 'kill', 'heal', 'investigate')),
  target_id UUID REFERENCES players(id),
  phase TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game messages/chat table
CREATE TABLE IF NOT EXISTS game_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'system', 'death', 'vote')),
  is_visible_to_all BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for players
CREATE POLICY "Players can view all players" ON players FOR SELECT USING (true);
CREATE POLICY "Players can insert their own profile" ON players FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Players can update their own profile" ON players FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for game_rooms
CREATE POLICY "Anyone can view game rooms" ON game_rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create game rooms" ON game_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Host can update their game room" ON game_rooms FOR UPDATE USING (auth.uid() = host_id);

-- RLS Policies for game_participants
CREATE POLICY "Anyone can view game participants" ON game_participants FOR SELECT USING (true);
CREATE POLICY "Players can join games" ON game_participants FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Players can update their own participation" ON game_participants FOR UPDATE USING (auth.uid() = player_id);

-- RLS Policies for game_actions
CREATE POLICY "Players can view actions in their games" ON game_actions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM game_participants 
    WHERE game_participants.game_id = game_actions.game_id 
    AND game_participants.player_id = auth.uid()
  )
);
CREATE POLICY "Players can insert their own actions" ON game_actions FOR INSERT WITH CHECK (auth.uid() = player_id);

-- RLS Policies for game_messages
CREATE POLICY "Players can view messages in their games" ON game_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM game_participants 
    WHERE game_participants.game_id = game_messages.game_id 
    AND game_participants.player_id = auth.uid()
  )
);
CREATE POLICY "Players can send messages" ON game_messages FOR INSERT WITH CHECK (auth.uid() = player_id);

-- Create indexes for better performance
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX idx_game_messages_game_id ON game_messages(game_id);

-- Function to generate unique room codes
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate room codes
CREATE OR REPLACE FUNCTION set_room_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_code IS NULL OR NEW.room_code = '' THEN
    LOOP
      NEW.room_code := generate_room_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM game_rooms WHERE room_code = NEW.room_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_room_code
  BEFORE INSERT ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION set_room_code();
