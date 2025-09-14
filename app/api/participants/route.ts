import { NextRequest, NextResponse } from 'next/server'
import { gameParticipants, gameMessages } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const { game_id, player_id, is_host } = await request.json()
    
    if (!game_id || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Check if player is already in the room
    const existingParticipant = await gameParticipants.findByGameAndPlayer(game_id, player_id)
    if (existingParticipant) {
      return NextResponse.json({ message: 'Player already in room' }, { status: 400 })
    }

    // Join the room
    await gameParticipants.create(game_id, player_id, 'villager', is_host ? true : false)

    // Add join message
    await gameMessages.create(game_id, null, `Player joined the game`, 'system', null, true)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error joining room:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
