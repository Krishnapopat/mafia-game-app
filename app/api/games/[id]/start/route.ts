import { NextRequest, NextResponse } from 'next/server'
import { gameRooms, gameParticipants, gameMessages } from '@/lib/db/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gameId = parseInt(params.id)
    
    // Get participants
    const participants = await gameParticipants.findByGame(gameId)
    if (participants.length < 4) {
      return NextResponse.json({ message: 'Need at least 4 players to start' }, { status: 400 })
    }

    // Get role config from game room
    const game = await gameRooms.findById(gameId)
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 })
    }

    let roleConfig
    if (game.role_config) {
      try {
        roleConfig = JSON.parse(game.role_config)
      } catch {
        roleConfig = null
      }
    }

    // If no role config, use default based on player count
    if (!roleConfig) {
      const playerCount = participants.length
      if (playerCount === 4) {
        roleConfig = { mafia: 1, villager: 1, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 }
      } else if (playerCount === 5) {
        roleConfig = { mafia: 1, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 }
      } else if (playerCount === 6) {
        roleConfig = { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 }
      } else if (playerCount === 7) {
        roleConfig = { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 1, bandit: 0 }
      } else if (playerCount === 8) {
        roleConfig = { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 0 }
      } else if (playerCount === 9) {
        roleConfig = { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 }
      } else if (playerCount === 10) {
        roleConfig = { mafia: 2, villager: 3, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 }
      } else if (playerCount === 11) {
        roleConfig = { mafia: 3, villager: 3, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 }
      } else if (playerCount === 12) {
        roleConfig = { mafia: 3, villager: 4, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 }
      } else {
        roleConfig = { mafia: 1, villager: 1, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 }
      }
    }

    // Create role array based on config
    const roles: string[] = []
    Object.entries(roleConfig).forEach(([role, count]) => {
      for (let i = 0; i < count; i++) {
        roles.push(role)
      }
    })

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]]
    }

    // Assign roles to participants
    for (let i = 0; i < participants.length; i++) {
      const role = roles[i] || 'villager'
      await gameParticipants.updateRole(participants[i].id, role)
    }

    // Update game status
    await gameRooms.updateStatus(gameId, 'in_progress', 'night', 1)

    // Add system message
    await gameMessages.create(gameId, null, 'The game has started! Night phase begins.', 'system', null, false)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error starting game:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
