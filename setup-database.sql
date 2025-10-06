-- Mafia Game Database Setup
-- Run this script on your production PostgreSQL database

-- Create players table
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create game_rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting',
    current_phase VARCHAR(20) DEFAULT 'lobby',
    day_number INTEGER DEFAULT 1,
    max_players INTEGER NOT NULL,
    current_players INTEGER DEFAULT 0,
    host_id INTEGER REFERENCES players(id),
    winner VARCHAR(20),
    role_config JSONB,
    doctor_can_heal_same_twice BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create game_participants table
CREATE TABLE IF NOT EXISTS game_participants (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id),
    role VARCHAR(20) NOT NULL,
    is_alive BOOLEAN DEFAULT true,
    is_host BOOLEAN DEFAULT false,
    last_healed_player_id INTEGER REFERENCES players(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, player_id)
);

-- Create game_messages table
CREATE TABLE IF NOT EXISTS game_messages (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id),
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create game_actions table
CREATE TABLE IF NOT EXISTS game_actions (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(id),
    action_type VARCHAR(20) NOT NULL,
    target_id INTEGER REFERENCES players(id),
    phase VARCHAR(20) NOT NULL,
    day_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create game_votes table
CREATE TABLE IF NOT EXISTS game_votes (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
    voter_id INTEGER REFERENCES players(id),
    target_id INTEGER REFERENCES players(id),
    day_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, voter_id, day_number)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_game_messages_game_id ON game_messages(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_votes_game_id ON game_votes(game_id);

-- Insert some sample data (optional)
-- You can remove this section if you don't want sample data
INSERT INTO players (username) VALUES 
    ('Player1'), ('Player2'), ('Player3'), ('Player4')
ON CONFLICT (username) DO NOTHING;

-- Generate a sample room code
INSERT INTO game_rooms (room_code, name, max_players, host_id) VALUES 
    ('ABC123', 'Sample Room', 8, 1)
ON CONFLICT (room_code) DO NOTHING;

COMMIT;
