import { promises as fs } from 'fs';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data');
const dbFile = join(dbPath, 'mafia_game.json');

// For Vercel deployment, we'll use a different approach
const isVercel = process.env.VERCEL === '1';

// In-memory database for Vercel (serverless functions)
let memoryDb: any = null;

// Ensure the database directory exists (only for local development)
async function ensureDbDir() {
  if (isVercel) return; // Skip for Vercel
  
  try {
    await fs.access(dbPath);
  } catch {
    await fs.mkdir(dbPath, { recursive: true });
  }
}

// Initialize database
async function initDatabase() {
  if (isVercel) {
    // For Vercel, use in-memory database
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

// Read database
async function readDb() {
  if (isVercel) {
    if (!memoryDb) {
      await initDatabase();
    }
    return memoryDb;
  }
  
  // For local development
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

// Write database
async function writeDb(data: any) {
  if (isVercel) {
    memoryDb = data;
    return;
  }
  
  // For local development
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
    const db = await readDb();
    return db.players.find((p: any) => p.id === id);
  },
  
  async findByUsername(username: string) {
    const db = await readDb();
    return db.players.find((p: any) => p.username === username);
  },
  
  async updateStats(id: number, won: number) {
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
    const db = await readDb();
    return db.game_rooms.find((r: any) => r.id === id);
  },
  
  async findByCode(roomCode: string) {
    const db = await readDb();
    return db.game_rooms.find((r: any) => r.room_code === roomCode && r.status === 'waiting');
  },
  
  async findAllWaiting() {
    const db = await readDb();
    return db.game_rooms.filter((r: any) => r.status === 'waiting').sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },
  
  async updateStatus(id: number, status: string, phase: string, dayNumber: number) {
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
    const db = await readDb();
    const room = db.game_rooms.find((r: any) => r.id === id);
    if (room) {
      room.current_players = count;
      await writeDb(db);
    }
  },

  async delete(id: number) {
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
    const db = await readDb();
    const participants = db.game_participants.filter((p: any) => p.game_id === gameId);
    // Join with players to get usernames
    const players = db.players;
    return participants.map((p: any) => ({
      ...p,
      username: players.find((pl: any) => pl.id === p.player_id)?.username || 'Unknown'
    })).sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
  },
  
  async findByGameAndPlayer(gameId: number, playerId: number) {
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
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.id === id);
    if (participant) {
      participant.role = role;
      await writeDb(db);
    }
  },
  
  async updateAlive(gameId: number, playerId: number, isAlive: boolean) {
    const db = await readDb();
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId);
    if (participant) {
      participant.is_alive = isAlive;
      await writeDb(db);
    }
  },
  
  async updateLastHealed(gameId: number, playerId: number, lastHealedPlayerId: number) {
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
    const db = await readDb();
    return db.game_actions.filter((a: any) => a.game_id === gameId && a.phase === phase && a.day_number === dayNumber);
  },
  
  async deleteByPlayer(gameId: number, playerId: number, actionType: string, phase: string, dayNumber: number) {
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
    const db = await readDb();
    const messages = db.game_messages.filter((m: any) => m.game_id === gameId);
    // Join with players to get usernames
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
