import { promises as fs } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const dbPath = join(process.cwd(), 'data');
const dbFile = join(dbPath, 'mafia_game.json');

// Check if we have a DATABASE_URL (production)
const isProduction = !!process.env.DATABASE_URL;
const isVercel = process.env.VERCEL === '1';

// PostgreSQL connection pool for production
let pool: Pool | null = null;

// Initialize PostgreSQL connection
function initPostgres() {
  if (!isProduction || pool) return;
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

// In-memory database for Vercel (fallback)
let memoryDb: any = null;

// Ensure the database directory exists (only for local development)
async function ensureDbDir() {
  if (isProduction || isVercel) return; // Skip for production/Vercel
  
  try {
    await fs.access(dbPath);
  } catch {
    await fs.mkdir(dbPath, { recursive: true });
  }
}

// Initialize database
async function initDatabase() {
  if (isProduction) {
    initPostgres();
    return;
  }
  
  if (isVercel) {
    // For Vercel without DATABASE_URL, use in-memory database
    if (!memoryDb) {
      memoryDb = {
        players: [],
        game_rooms: [],
        game_participants: [],
        game_actions: [],
        game_messages: []
      };
    }
    return;
  }
  
  // For local development, use file system
  await ensureDbDir();
  
  try {
    await fs.access(dbFile);
  } catch {
    // Create initial database structure
    const initialData = {
      players: [],
      game_rooms: [],
      game_participants: [],
      game_actions: [],
      game_messages: []
    };
    await fs.writeFile(dbFile, JSON.stringify(initialData, null, 2));
  }
}

// Read database (file-based)
async function readDb() {
  if (isProduction || isVercel) {
    throw new Error('readDb should not be called in production/Vercel');
  }
  
  await ensureDbDir();
  try {
    const data = await fs.readFile(dbFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    await initDatabase();
    const data = await fs.readFile(dbFile, 'utf-8');
    return JSON.parse(data);
  }
}

// Write database (file-based)
async function writeDb(data: any) {
  if (isProduction || isVercel) {
    throw new Error('writeDb should not be called in production/Vercel');
  }
  
  await ensureDbDir();
  await fs.writeFile(dbFile, JSON.stringify(data, null, 2));
}

// Generate unique room code
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Player operations
export const players = {
  async create(username: string) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO players (username) VALUES ($1) RETURNING *',
        [username]
      );
      return result.rows[0];
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const newPlayer = {
        id: Date.now(),
        username,
        games_played: 0,
        games_won: 0,
        created_at: new Date().toISOString()
      };
      memoryDb.players.push(newPlayer);
      return newPlayer;
    }
    
    const db = await readDb();
    const newPlayer = {
      id: Date.now(),
      username,
      games_played: 0,
      games_won: 0,
      created_at: new Date().toISOString()
    };
    db.players.push(newPlayer);
    await writeDb(db);
    return newPlayer;
  },
  
  async findById(id: number) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM players WHERE id = $1', [id]);
      return result.rows[0] || null;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.players.find((p: any) => p.id === id) || null;
    }
    
    const db = await readDb();
    return db.players.find((p: any) => p.id === id) || null;
  },
  
  async findByUsername(username: string) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM players WHERE username = $1', [username]);
      return result.rows[0] || null;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.players.find((p: any) => p.username === username) || null;
    }
    
    const db = await readDb();
    return db.players.find((p: any) => p.username === username) || null;
  },
  
  async updateStats(id: number, won: number) {
    if (isProduction) {
      await pool!.query(
        'UPDATE players SET games_played = games_played + 1, games_won = games_won + $1 WHERE id = $2',
        [won, id]
      );
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const player = memoryDb.players.find((p: any) => p.id === id);
      if (player) {
        player.games_played += 1;
        player.games_won += won;
      }
      return;
    }
    
    const db = await readDb();
    const player = db.players.find((p: any) => p.id === id);
    if (player) {
      player.games_played += 1;
      player.games_won += won;
      await writeDb(db);
    }
  }
};

// Game room operations
export const gameRooms = {
  async create(roomCode: string, name: string, hostId: number, maxPlayers: number, roleConfig: any, doctorCanHealSameTwice: boolean) {
    if (isProduction) {
      const result = await pool!.query(
        `INSERT INTO game_rooms (room_code, name, host_id, max_players, current_players, status, current_phase, day_number, role_config, doctor_can_heal_same_twice) 
         VALUES ($1, $2, $3, $4, 1, 'waiting', 'lobby', 0, $5, $6) RETURNING *`,
        [roomCode, name, hostId, maxPlayers, JSON.stringify(roleConfig), doctorCanHealSameTwice]
      );
      return result.rows[0];
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const newRoom = {
        id: Date.now(),
        room_code: roomCode,
        name,
        host_id: hostId,
        max_players: maxPlayers,
        current_players: 1,
        status: 'waiting',
        current_phase: 'lobby',
        day_number: 0,
        winner: null,
        role_config: JSON.stringify(roleConfig),
        doctor_can_heal_same_twice: doctorCanHealSameTwice,
        created_at: new Date().toISOString()
      };
      memoryDb.game_rooms.push(newRoom);
      return newRoom;
    }
    
    const db = await readDb();
    const newRoom = {
      id: Date.now(),
      room_code: roomCode,
      name,
      host_id: hostId,
      max_players: maxPlayers,
      current_players: 1,
      status: 'waiting',
      current_phase: 'lobby',
      day_number: 0,
      winner: null,
      role_config: JSON.stringify(roleConfig),
      doctor_can_heal_same_twice: doctorCanHealSameTwice,
      created_at: new Date().toISOString()
    };
    db.game_rooms.push(newRoom);
    await writeDb(db);
    return newRoom;
  },
  
  async findById(id: number) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE id = $1', [id]);
      return result.rows[0] || null;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.game_rooms.find((r: any) => r.id === id) || null;
    }
    
    const db = await readDb();
    return db.game_rooms.find((r: any) => r.id === id) || null;
  },
  
  async findByCode(roomCode: string) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE room_code = $1 AND status = $2', [roomCode, 'waiting']);
      return result.rows[0] || null;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.game_rooms.find((r: any) => r.room_code === roomCode && r.status === 'waiting') || null;
    }
    
    const db = await readDb();
    return db.game_rooms.find((r: any) => r.room_code === roomCode && r.status === 'waiting') || null;
  },
  
  async findAllWaiting() {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE status = $1 ORDER BY created_at DESC', ['waiting']);
      return result.rows;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.game_rooms.filter((r: any) => r.status === 'waiting').sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    
    const db = await readDb();
    return db.game_rooms.filter((r: any) => r.status === 'waiting').sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  async updateStatus(id: number, status: string, phase: string, dayNumber: number) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_rooms SET status = $1, current_phase = $2, day_number = $3 WHERE id = $4',
        [status, phase, dayNumber, id]
      );
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const room = memoryDb.game_rooms.find((r: any) => r.id === id);
      if (room) {
        room.status = status;
        room.current_phase = phase;
        room.day_number = dayNumber;
      }
      return;
    }
    
    const db = await readDb();
    const room = db.game_rooms.find((r: any) => r.id === id);
    if (room) {
      room.status = status;
      room.current_phase = phase;
      room.day_number = dayNumber;
      await writeDb(db);
    }
  },
  
  async updatePlayerCount(id: number, count: number) {
    if (isProduction) {
      await pool!.query('UPDATE game_rooms SET current_players = $1 WHERE id = $2', [count, id]);
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const room = memoryDb.game_rooms.find((r: any) => r.id === id);
      if (room) {
        room.current_players = count;
      }
      return;
    }
    
    const db = await readDb();
    const room = db.game_rooms.find((r: any) => r.id === id);
    if (room) {
      room.current_players = count;
      await writeDb(db);
    }
  },

  async delete(id: number) {
    if (isProduction) {
      // Delete all related data first (CASCADE should handle this, but being explicit)
      await pool!.query('DELETE FROM game_messages WHERE game_id = $1', [id]);
      await pool!.query('DELETE FROM game_actions WHERE game_id = $1', [id]);
      await pool!.query('DELETE FROM game_participants WHERE game_id = $1', [id]);
      await pool!.query('DELETE FROM game_rooms WHERE id = $1', [id]);
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      // Delete all related data first
      memoryDb.game_messages = memoryDb.game_messages.filter((m: any) => m.game_id !== id);
      memoryDb.game_actions = memoryDb.game_actions.filter((a: any) => a.game_id !== id);
      memoryDb.game_participants = memoryDb.game_participants.filter((p: any) => p.game_id !== id);
      memoryDb.game_rooms = memoryDb.game_rooms.filter((r: any) => r.id !== id);
      return;
    }
    
    const db = await readDb();
    // Delete all related data first
    db.game_messages = db.game_messages.filter((m: any) => m.game_id !== id);
    db.game_actions = db.game_actions.filter((a: any) => a.game_id !== id);
    db.game_participants = db.game_participants.filter((p: any) => p.game_id !== id);
    db.game_rooms = db.game_rooms.filter((r: any) => r.id !== id);
    await writeDb(db);
  }
};

// Game participants operations
export const gameParticipants = {
  async create(gameId: number, playerId: number, role: string, isHost: boolean) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_participants (game_id, player_id, role, is_alive, is_host) VALUES ($1, $2, $3, true, $4) RETURNING *',
        [gameId, playerId, role, isHost]
      );
      return result.rows[0];
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const newParticipant = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        role,
        is_alive: true,
        is_host: isHost,
        last_healed_player_id: null,
        joined_at: new Date().toISOString()
      };
      memoryDb.game_participants.push(newParticipant);
      return newParticipant;
    }
    
    const db = await readDb();
    const newParticipant = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      role,
      is_alive: true,
      is_host: isHost,
      last_healed_player_id: null,
      joined_at: new Date().toISOString()
    };
    db.game_participants.push(newParticipant);
    await writeDb(db);
    return newParticipant;
  },
  
  async findByGame(gameId: number) {
    if (isProduction) {
      const result = await pool!.query(
        `SELECT gp.*, p.username 
         FROM game_participants gp 
         JOIN players p ON gp.player_id = p.id 
         WHERE gp.game_id = $1 
         ORDER BY gp.created_at ASC`,
        [gameId]
      );
      return result.rows;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const participants = memoryDb.game_participants.filter((p: any) => p.game_id === gameId);
      const players = memoryDb.players;
      return participants.map((p: any) => ({
        ...p,
        username: players.find((pl: any) => pl.id === p.player_id)?.username || 'Unknown'
      })).sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
    }
    
    const db = await readDb();
    const participants = db.game_participants.filter((p: any) => p.game_id === gameId);
    const players = db.players;
    return participants.map((p: any) => ({
      ...p,
      username: players.find((pl: any) => pl.id === p.player_id)?.username || 'Unknown'
    })).sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
  },
  
  async findByGameAndPlayer(gameId: number, playerId: number) {
    if (isProduction) {
      const result = await pool!.query(
        `SELECT gp.*, p.username 
         FROM game_participants gp 
         JOIN players p ON gp.player_id = p.id 
         WHERE gp.game_id = $1 AND gp.player_id = $2`,
        [gameId, playerId]
      );
      return result.rows[0] || null;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const participant = memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
      if (participant) {
        const player = memoryDb.players.find((pl: any) => pl.id === participant.player_id);
        return {
          ...participant,
          username: player?.username || 'Unknown'
        };
      }
      return null;
    }
    
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
    if (participant) {
      const player = db.players.find((pl: any) => pl.id === participant.player_id);
      return {
        ...participant,
        username: player?.username || 'Unknown'
      };
    }
    return null;
  },
  
  async updateRole(id: number, role: string) {
    if (isProduction) {
      await pool!.query('UPDATE game_participants SET role = $1 WHERE id = $2', [role, id]);
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const participant = memoryDb.game_participants.find((p: any) => p.id === id);
      if (participant) {
        participant.role = role;
      }
      return;
    }
    
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.id === id);
    if (participant) {
      participant.role = role;
      await writeDb(db);
    }
  },
  
  async updateAlive(gameId: number, playerId: number, isAlive: boolean) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_participants SET is_alive = $1 WHERE game_id = $2 AND player_id = $3',
        [isAlive, gameId, playerId]
      );
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const participant = memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
      if (participant) {
        participant.is_alive = isAlive;
      }
      return;
    }
    
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
    if (participant) {
      participant.is_alive = isAlive;
      await writeDb(db);
    }
  },
  
  async updateLastHealed(gameId: number, playerId: number, lastHealedPlayerId: number) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_participants SET last_healed_player_id = $1 WHERE game_id = $2 AND player_id = $3',
        [lastHealedPlayerId, gameId, playerId]
      );
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const participant = memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
      if (participant) {
        participant.last_healed_player_id = lastHealedPlayerId;
      }
      return;
    }
    
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
    if (participant) {
      participant.last_healed_player_id = lastHealedPlayerId;
      await writeDb(db);
    }
  }
};

// Game actions operations
export const gameActions = {
  async create(gameId: number, playerId: number, actionType: string, targetId: number, phase: string, dayNumber: number) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_actions (game_id, player_id, action_type, target_id, day_number) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [gameId, playerId, actionType, targetId, dayNumber]
      );
      return result.rows[0];
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const newAction = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        action_type: actionType,
        target_id: targetId,
        phase,
        day_number: dayNumber,
        created_at: new Date().toISOString()
      };
      memoryDb.game_actions.push(newAction);
      return newAction;
    }
    
    const db = await readDb();
    const newAction = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      action_type: actionType,
      target_id: targetId,
      phase,
      day_number: dayNumber,
      created_at: new Date().toISOString()
    };
    db.game_actions.push(newAction);
    await writeDb(db);
    return newAction;
  },
  
  async findByGameAndPhase(gameId: number, phase: string, dayNumber: number) {
    if (isProduction) {
      const result = await pool!.query(
        'SELECT * FROM game_actions WHERE game_id = $1 AND day_number = $2',
        [gameId, dayNumber]
      );
      return result.rows;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      return memoryDb.game_actions.filter((a: any) => a.game_id === gameId && a.phase === phase && a.day_number === dayNumber);
    }
    
    const db = await readDb();
    return db.game_actions.filter((a: any) => a.game_id === gameId && a.phase === phase && a.day_number === dayNumber);
  },
  
  async deleteByPlayer(gameId: number, playerId: number, actionType: string, phase: string, dayNumber: number) {
    if (isProduction) {
      await pool!.query(
        'DELETE FROM game_actions WHERE game_id = $1 AND player_id = $2 AND action_type = $3 AND day_number = $4',
        [gameId, playerId, actionType, dayNumber]
      );
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      memoryDb.game_actions = memoryDb.game_actions.filter((a: any) => 
        !(a.game_id === gameId && a.player_id === playerId && a.action_type === actionType && a.phase === phase && a.day_number === dayNumber)
      );
      return;
    }
    
    const db = await readDb();
    db.game_actions = db.game_actions.filter((a: any) => 
      !(a.game_id === gameId && a.player_id === playerId && a.action_type === actionType && a.phase === phase && a.day_number === dayNumber)
    );
    await writeDb(db);
  }
};

// Game messages operations
export const gameMessages = {
  async create(gameId: number, playerId: number | null, message: string, messageType: string, visibleToPlayerId: number | null, isVisibleToAll: boolean) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_messages (game_id, player_id, message, message_type) VALUES ($1, $2, $3, $4) RETURNING *',
        [gameId, playerId, message, messageType]
      );
      return result.rows[0];
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const newMessage = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        message,
        message_type: messageType,
        visible_to_player_id: visibleToPlayerId,
        is_visible_to_all: isVisibleToAll,
        created_at: new Date().toISOString()
      };
      memoryDb.game_messages.push(newMessage);
      return newMessage;
    }
    
    const db = await readDb();
    const newMessage = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      message,
      message_type: messageType,
      visible_to_player_id: visibleToPlayerId,
      is_visible_to_all: isVisibleToAll,
      created_at: new Date().toISOString()
    };
    db.game_messages.push(newMessage);
    await writeDb(db);
    return newMessage;
  },
  
  async findByGame(gameId: number) {
    if (isProduction) {
      const result = await pool!.query(
        `SELECT gm.*, p.username 
         FROM game_messages gm 
         LEFT JOIN players p ON gm.player_id = p.id 
         WHERE gm.game_id = $1 
         ORDER BY gm.created_at ASC`,
        [gameId]
      );
      return result.rows;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const messages = memoryDb.game_messages.filter((m: any) => m.game_id === gameId);
      const players = memoryDb.players;
      return messages.map((m: any) => ({
        ...m,
        username: m.player_id ? players.find((p: any) => p.id === m.player_id)?.username : null
      })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    
    const db = await readDb();
    const messages = db.game_messages.filter((m: any) => m.game_id === gameId);
    const players = db.players;
    return messages.map((m: any) => ({
      ...m,
      username: m.player_id ? players.find((p: any) => p.id === m.player_id)?.username : null
    })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
};

// Initialize database on import
initDatabase();

export default { players, gameRooms, gameParticipants, gameActions, gameMessages };
