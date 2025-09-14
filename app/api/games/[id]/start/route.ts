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

    // Simple role assignment - just assign basic roles for now
    const roles = ['mafia', 'mafia', 'doctor', 'detective', 'villager', 'villager', 'villager', 'villager']
    
    for (let i = 0; i < participants.length; i++) {
      const role = roles[i] || 'villager'
      await gameParticipants.updateRole(participants[i].id, role)
    }

    // Update game status
    await gameRooms.updateStatus(gameId, 'night', 'night', 1)

    // Add system message
    await gameMessages.create(gameId, null, 'The game has started! Night phase begins.', 'system', null, true)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error starting game:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
