import { Pool } from 'pg'
import fs from 'fs/promises'
import path from 'path'

// Check if we're in production (PostgreSQL)
const isProduction = process.env.DATABASE_URL && process.env.NODE_ENV === 'production'
const isVercel = process.env.VERCEL === '1'

// PostgreSQL connection pool
let pool: Pool | null = null
if (isProduction) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })
}

// In-memory database for Vercel
let memoryDb: any = null

// JSON file database for local development
const DB_FILE = path.join(process.cwd(), 'data', 'mafia_game.json')

async function initDatabase() {
  if (isVercel) {
    if (!memoryDb) {
      memoryDb = {
        players: [],
        game_rooms: [],
        game_participants: [],
        game_actions: [],
        game_messages: []
      }
    }
    return
  }
  
  const dbDir = path.dirname(DB_FILE)
  try {
    await fs.access(dbDir)
  } catch {
    await fs.mkdir(dbDir, { recursive: true })
  }
  
  try {
    await fs.access(DB_FILE)
  } catch {
    const initialData = {
      players: [],
      game_rooms: [],
      game_participants: [],
      game_actions: [],
      game_messages: []
    }
    await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2))
  }
}

async function readDb() {
  if (isVercel) {
    if (!memoryDb) await initDatabase()
    return memoryDb
  }
  
  await initDatabase()
  const data = await fs.readFile(DB_FILE, 'utf-8')
  return JSON.parse(data)
}

async function writeDb(db: any) {
  if (isVercel) {
    if (!memoryDb) await initDatabase()
    memoryDb = db
    return
  }
  
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2))
}

export const players = {
  async create(username: string) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO players (username, created_at) VALUES ($1, NOW()) RETURNING *',
        [username]
      )
      return result.rows[0]
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const newPlayer = {
        id: Date.now(),
        username,
        games_played: 0,
        games_won: 0,
        created_at: new Date().toISOString()
      }
      memoryDb.players.push(newPlayer)
      return newPlayer
    }
    
    const db = await readDb()
    const newPlayer = {
      id: Date.now(),
      username,
      games_played: 0,
      games_won: 0,
      created_at: new Date().toISOString()
    }
    db.players.push(newPlayer)
    await writeDb(db)
    return newPlayer
  },
  
  async findById(id: number) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM players WHERE id = $1', [id])
      return result.rows[0] || null
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.players.find((p: any) => p.id === id) || null
    }
    
    const db = await readDb()
    return db.players.find((p: any) => p.id === id) || null
  },
  
  async findByUsername(username: string) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM players WHERE username = $1', [username])
      return result.rows[0] || null
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.players.find((p: any) => p.username === username) || null
    }
    
    const db = await readDb()
    return db.players.find((p: any) => p.username === username) || null
  },
  
  async deleteOldPlayers() {
    if (isProduction) {
      try {
        // Use a more robust approach - first get all old players who are not hosts
        const result = await pool!.query(`
          SELECT p.id 
          FROM players p
          WHERE p.created_at < NOW() - INTERVAL '1 hour'
          AND p.id NOT IN (
            SELECT DISTINCT host_id 
            FROM game_rooms 
            WHERE status IN ('waiting', 'in_progress')
            AND host_id IS NOT NULL
          )
        `);
        
        // Delete them one by one to avoid any constraint issues
        for (const row of result.rows) {
          await pool!.query('DELETE FROM players WHERE id = $1', [row.id]);
        }
      } catch (error) {
        console.error('Error during player cleanup:', error);
        // Don't throw the error, just log it
      }
      return;
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase();
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // Get active room host IDs
      const activeHostIds = memoryDb.game_rooms
        .filter((r: any) => r.status === 'waiting' || r.status === 'in_progress')
        .map((r: any) => r.host_id);
      
      // Only delete players who are not active hosts
      memoryDb.players = memoryDb.players.filter((p: any) => 
        p.created_at > oneHourAgo || activeHostIds.includes(p.id)
      );
      return;
    }
    
    const db = await readDb();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Get active room host IDs
    const activeHostIds = db.game_rooms
      .filter((r: any) => r.status === 'waiting' || r.status === 'in_progress')
      .map((r: any) => r.host_id);
    
    // Only delete players who are not active hosts
    db.players = db.players.filter((p: any) => 
      p.created_at > oneHourAgo || activeHostIds.includes(p.id)
    );
    await writeDb(db);
  }
}

export const gameRooms = {
  async create(name: string, hostId: number, maxPlayers: number, roleConfig: any, doctorCanHealSameTwice: boolean) {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_rooms (room_code, name, host_id, max_players, current_players, status, current_phase, day_number, role_config, doctor_can_heal_same_twice, created_at) VALUES ($1, $2, $3, $4, 1, $5, $6, 1, $7, $8, NOW()) RETURNING *',
        [roomCode, name, hostId, maxPlayers, 'waiting', 'lobby', JSON.stringify(roleConfig), doctorCanHealSameTwice]
      )
      return result.rows[0]
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const newRoom = {
        id: Date.now(),
        room_code: roomCode,
        name,
        host_id: hostId,
        max_players: maxPlayers,
        current_players: 1,
        status: 'waiting',
        current_phase: 'lobby',
        day_number: 1,
        role_config: JSON.stringify(roleConfig),
        doctor_can_heal_same_twice: doctorCanHealSameTwice,
        created_at: new Date().toISOString()
      }
      memoryDb.game_rooms.push(newRoom)
      return newRoom
    }
    
    const db = await readDb()
    const newRoom = {
      id: Date.now(),
      room_code: roomCode,
      name,
      host_id: hostId,
      max_players: maxPlayers,
      current_players: 1,
      status: 'waiting',
      current_phase: 'lobby',
      day_number: 1,
      role_config: JSON.stringify(roleConfig),
      doctor_can_heal_same_twice: doctorCanHealSameTwice,
      created_at: new Date().toISOString()
    }
    db.game_rooms.push(newRoom)
    await writeDb(db)
    return newRoom
  },
  
  async findById(id: number) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE id = $1', [id])
      return result.rows[0] || null
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.game_rooms.find((r: any) => r.id === id) || null
    }
    
    const db = await readDb()
    return db.game_rooms.find((r: any) => r.id === id) || null
  },
  
  async findByRoomCode(roomCode: string) {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE room_code = $1', [roomCode])
      return result.rows[0] || null
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.game_rooms.find((r: any) => r.room_code === roomCode) || null
    }
    
    const db = await readDb()
    return db.game_rooms.find((r: any) => r.room_code === roomCode) || null
  },
  
  async findAllWaiting() {
    if (isProduction) {
      const result = await pool!.query('SELECT * FROM game_rooms WHERE status = $1 ORDER BY created_at DESC', ['waiting'])
      const rooms = result.rows
      
      // Now recalculate from actual participants
      for (const room of rooms) {
        const participantCount = await pool!.query('SELECT COUNT(*) FROM game_participants WHERE game_id = $1', [room.id])
        room.current_players = parseInt(participantCount.rows[0].count)
      }
      
      return rooms
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const rooms = memoryDb.game_rooms.filter((r: any) => r.status === 'waiting')
      
      // Now recalculate from actual participants
      for (const room of rooms) {
        const participantCount = memoryDb.game_participants.filter((p: any) => p.game_id === room.id).length
        room.current_players = participantCount
      }
      
      return rooms
    }
    
    const db = await readDb()
    const rooms = db.game_rooms.filter((r: any) => r.status === 'waiting')
    
    // Now recalculate from actual participants
    for (const room of rooms) {
      const participantCount = db.game_participants.filter((p: any) => p.game_id === room.id).length
      room.current_players = participantCount
    }
    
    return rooms
  },
  
  async updateStatus(id: number, status: string, phase: string, dayNumber: number) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_rooms SET status = $1, current_phase = $2, day_number = $3 WHERE id = $4',
        [status, phase, dayNumber, id]
      )
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const room = memoryDb.game_rooms.find((r: any) => r.id === id)
      if (room) {
        room.status = status
        room.current_phase = phase
        room.day_number = dayNumber
      }
      return
    }
    
    const db = await readDb()
    const room = db.game_rooms.find((r: any) => r.id === id)
    if (room) {
      room.status = status
      room.current_phase = phase
      room.day_number = dayNumber
      await writeDb(db)
    }
  },
  
  async updatePlayerCount(id: number, count: number) {
    if (isProduction) {
      await pool!.query('UPDATE game_rooms SET current_players = $1 WHERE id = $2', [count, id])
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const room = memoryDb.game_rooms.find((r: any) => r.id === id)
      if (room) {
        room.current_players = count
      }
      return
    }
    
    const db = await readDb()
    const room = db.game_rooms.find((r: any) => r.id === id)
    if (room) {
      room.current_players = count
      await writeDb(db)
    }
  },

  async updateHost(id: number, newHostId: number) {
    if (isProduction) {
      await pool!.query('UPDATE game_rooms SET host_id = $1 WHERE id = $2', [newHostId, id])
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const room = memoryDb.game_rooms.find((r: any) => r.id === id)
      if (room) {
        room.host_id = newHostId
      }
      return
    }
    
    const db = await readDb()
    const room = db.game_rooms.find((r: any) => r.id === id)
    if (room) {
      room.host_id = newHostId
      await writeDb(db)
    }
  },

  async updateWinner(id: number, winner: string) {
    if (isProduction) {
      await pool!.query('UPDATE game_rooms SET winner = $1 WHERE id = $2', [winner, id])
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const room = memoryDb.game_rooms.find((r: any) => r.id === id)
      if (room) {
        room.winner = winner
      }
      return
    }
    
    const db = await readDb()
    const room = db.game_rooms.find((r: any) => r.id === id)
    if (room) {
      room.winner = winner
      await writeDb(db)
    }
  },
  
  async delete(id: number) {
    if (isProduction) {
      // Delete in order to respect foreign key constraints
      await pool!.query('DELETE FROM game_messages WHERE game_id = $1', [id])
      await pool!.query('DELETE FROM game_actions WHERE game_id = $1', [id])
      await pool!.query('DELETE FROM game_participants WHERE game_id = $1', [id])
      await pool!.query('DELETE FROM game_rooms WHERE id = $1', [id])
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      memoryDb.game_messages = memoryDb.game_messages.filter((m: any) => m.game_id !== id)
      memoryDb.game_actions = memoryDb.game_actions.filter((a: any) => a.game_id !== id)
      memoryDb.game_participants = memoryDb.game_participants.filter((p: any) => p.game_id !== id)
      memoryDb.game_rooms = memoryDb.game_rooms.filter((r: any) => r.id !== id)
      return
    }
    
    const db = await readDb()
    db.game_messages = db.game_messages.filter((m: any) => m.game_id !== id)
    db.game_actions = db.game_actions.filter((a: any) => a.game_id !== id)
    db.game_participants = db.game_participants.filter((p: any) => p.game_id !== id)
    db.game_rooms = db.game_rooms.filter((r: any) => r.id !== id)
    await writeDb(db)
  }
}

export const gameParticipants = {
  async create(gameId: number, playerId: number, isHost: boolean, role: string = 'villager') {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_participants (game_id, player_id, role, is_alive, is_host, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
        [gameId, playerId, role, true, isHost]
      )
      return result.rows[0]
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const newParticipant = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        role,
        is_alive: true,
        is_host: isHost,
        created_at: new Date().toISOString()
      }
      memoryDb.game_participants.push(newParticipant)
      return newParticipant
    }
    
    const db = await readDb()
    const newParticipant = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      role,
      is_alive: true,
      is_host: isHost,
      created_at: new Date().toISOString()
    }
    db.game_participants.push(newParticipant)
    await writeDb(db)
    return newParticipant
  },
  
  async findByGame(gameId: number) {
    if (isProduction) {
      const result = await pool!.query(
        `SELECT gp.*, p.username 
         FROM game_participants gp 
         JOIN players p ON gp.player_id = p.id 
         WHERE gp.game_id = $1 
         ORDER BY gp.id ASC`,
        [gameId]
      )
      return result.rows
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.game_participants
        .filter((p: any) => p.game_id === gameId)
        .map((p: any) => {
          const player = memoryDb.players.find((pl: any) => pl.id === p.player_id)
          return { ...p, username: player?.username || 'Unknown' }
        })
    }
    
    const db = await readDb()
    return db.game_participants
      .filter((p: any) => p.game_id === gameId)
      .map((p: any) => {
        const player = db.players.find((pl: any) => pl.id === p.player_id)
        return { ...p, username: player?.username || 'Unknown' }
      })
  },
  
  async findByGameAndPlayer(gameId: number, playerId: number) {
    if (isProduction) {
      const result = await pool!.query(
        'SELECT * FROM game_participants WHERE game_id = $1 AND player_id = $2',
        [gameId, playerId]
      )
      return result.rows[0] || null
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId) || null
    }
    
    const db = await readDb()
    return db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId) || null
  },
  
  async updateRole(id: number, role: string) {
    if (isProduction) {
      await pool!.query('UPDATE game_participants SET role = $1 WHERE id = $2', [role, id])
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const participant = memoryDb.game_participants.find((p: any) => p.id === id)
      if (participant) {
        participant.role = role
      }
      return
    }
    
    const db = await readDb()
    const participant = db.game_participants.find((p: any) => p.id === id)
    if (participant) {
      participant.role = role
      await writeDb(db)
    }
  },
  
  async updateAlive(gameId: number, playerId: number, isAlive: boolean) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_participants SET is_alive = $1 WHERE game_id = $2 AND player_id = $3',
        [isAlive, gameId, playerId]
      )
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const participant = memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId)
      if (participant) {
        participant.is_alive = isAlive
      }
      return
    }
    
    const db = await readDb()
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId)
    if (participant) {
      participant.is_alive = isAlive
      await writeDb(db)
    }
  },
  
  async updateLastHealed(gameId: number, playerId: number, targetId: number) {
    if (isProduction) {
      await pool!.query(
        'UPDATE game_participants SET last_healed_player_id = $1 WHERE game_id = $2 AND player_id = $3',
        [targetId, gameId, playerId]
      )
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const participant = memoryDb.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId)
      if (participant) {
        participant.last_healed_player_id = targetId
      }
      return
    }
    
    const db = await readDb()
    const participant = db.game_participants.find((p: any) => p.game_id === gameId && p.player_id === playerId)
    if (participant) {
      participant.last_healed_player_id = targetId
      await writeDb(db)
    }
  },
  
  async remove(gameId: number, playerId: number) {
    if (isProduction) {
      await pool!.query(
        'DELETE FROM game_participants WHERE game_id = $1 AND player_id = $2',
        [gameId, playerId]
      )
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      memoryDb.game_participants = memoryDb.game_participants.filter(
        (p: any) => !(p.game_id === gameId && p.player_id === playerId)
      )
      return
    }
    
    const db = await readDb()
    db.game_participants = db.game_participants.filter(
      (p: any) => !(p.game_id === gameId && p.player_id === playerId)
    )
    await writeDb(db)
  }
}

export const gameActions = {
  async create(gameId: number, playerId: number, actionType: string, targetId: number, phase: string, dayNumber: number) {
    if (isProduction) {
      const result = await pool!.query(
        'INSERT INTO game_actions (game_id, player_id, action_type, target_id, phase, day_number, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
        [gameId, playerId, actionType, targetId, phase, dayNumber]
      )
      return result.rows[0]
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const newAction = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        action_type: actionType,
        target_id: targetId,
        phase,
        day_number: dayNumber,
        created_at: new Date().toISOString()
      }
      memoryDb.game_actions.push(newAction)
      return newAction
    }
    
    const db = await readDb()
    const newAction = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      action_type: actionType,
      target_id: targetId,
      phase,
      day_number: dayNumber,
      created_at: new Date().toISOString()
    }
    db.game_actions.push(newAction)
    await writeDb(db)
    return newAction
  },
  
  async findByGameAndPhase(gameId: number, phase: string, dayNumber: number) {
    if (isProduction) {
      const result = await pool!.query(
        'SELECT * FROM game_actions WHERE game_id = $1 AND phase = $2 AND day_number = $3',
        [gameId, phase, dayNumber]
      )
      return result.rows
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      return memoryDb.game_actions.filter((a: any) => 
        a.game_id === gameId && a.phase === phase && a.day_number === dayNumber
      )
    }
    
    const db = await readDb()
    return db.game_actions.filter((a: any) => 
      a.game_id === gameId && a.phase === phase && a.day_number === dayNumber
    )
  },
  
  async clearByGameAndPhase(gameId: number, dayNumber: number) {
    if (isProduction) {
      await pool!.query(
        'DELETE FROM game_actions WHERE game_id = $1 AND day_number = $2',
        [gameId, dayNumber]
      )
      return
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      memoryDb.game_actions = memoryDb.game_actions.filter((a: any) => 
        !(a.game_id === gameId && a.day_number === dayNumber)
      )
      return
    }
    
    const db = await readDb()
    db.game_actions = db.game_actions.filter((a: any) => 
      !(a.game_id === gameId && a.day_number === dayNumber)
    )
    await writeDb(db)
  }
}

export const gameMessages = {
  async create(gameId: number, playerId: number | null, message: string, messageType: string, visibleToPlayerId: number | null, isSystem: boolean) {
    if (isProduction) {
      // For PostgreSQL, we need to handle the visible_to_player_id properly
      // Since the column might not exist, we'll store it in the message itself for private messages
      if (messageType === 'private' && visibleToPlayerId) {
        // For private messages, we'll add a marker to the message
        const privateMessage = `[PRIVATE_TO_${visibleToPlayerId}]${message}`
        const result = await pool!.query(
          'INSERT INTO game_messages (game_id, player_id, message, message_type, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
          [gameId, playerId, privateMessage, messageType]
        )
        return result.rows[0]
      } else {
        const result = await pool!.query(
          'INSERT INTO game_messages (game_id, player_id, message, message_type, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
          [gameId, playerId, message, messageType]
        )
        return result.rows[0]
      }
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const newMessage = {
        id: Date.now(),
        game_id: gameId,
        player_id: playerId,
        message,
        message_type: messageType,
        visible_to_player_id: visibleToPlayerId,
        is_system: isSystem,
        created_at: new Date().toISOString()
      }
      memoryDb.game_messages.push(newMessage)
      return newMessage
    }
    
    const db = await readDb()
    const newMessage = {
      id: Date.now(),
      game_id: gameId,
      player_id: playerId,
      message,
      message_type: messageType,
      visible_to_player_id: visibleToPlayerId,
      is_system: isSystem,
      created_at: new Date().toISOString()
    }
    db.game_messages.push(newMessage)
    await writeDb(db)
    return newMessage
  },
  
  async findByGame(gameId: number, playerId: number) {
    if (isProduction) {
      const result = await pool!.query(
        `SELECT gm.*, p.username 
         FROM game_messages gm 
         LEFT JOIN players p ON gm.player_id = p.id 
         WHERE gm.game_id = $1 
         ORDER BY gm.created_at ASC`,
        [gameId]
      )
      
      // Filter messages based on visibility for PostgreSQL
      const filteredMessages = result.rows.filter((msg: any) => {
        if (msg.message_type === 'private') {
          // Check if this is a private message for the current player
          const privateMatch = msg.message.match(/^\[PRIVATE_TO_(\d+)\](.*)$/)
          if (privateMatch) {
            const targetPlayerId = parseInt(privateMatch[1])
            const actualMessage = privateMatch[2]
            if (targetPlayerId === playerId) {
              // This message is for the current player, show it
              msg.message = actualMessage
              return true
            } else {
              // This message is for someone else, hide it
              return false
            }
          }
        }
        // Show all non-private messages
        return true
      })
      
      return filteredMessages
    }
    
    if (isVercel) {
      if (!memoryDb) await initDatabase()
      const messages = memoryDb.game_messages.filter((m: any) => m.game_id === gameId)
      return messages.map((m: any) => {
        const player = memoryDb.players.find((p: any) => p.id === m.player_id)
        return { ...m, username: player?.username || null }
      }).filter((m: any) => 
        !m.visible_to_player_id || m.visible_to_player_id === playerId
      )
    }
    
    const db = await readDb()
    const messages = db.game_messages.filter((m: any) => m.game_id === gameId)
    return messages.map((m: any) => {
      const player = db.players.find((p: any) => p.id === m.player_id)
      return { ...m, username: player?.username || null }
    }).filter((m: any) => 
      !m.visible_to_player_id || m.visible_to_player_id === playerId
    )
  }
}
