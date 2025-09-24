import { NextRequest, NextResponse } from 'next/server'
import { gameRooms, gameParticipants, gameMessages } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const { room_code, player_id } = await request.json()
    
    if (!room_code || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Find room by code
    const room = await gameRooms.findByRoomCode(room_code)
    if (!room) {
      return NextResponse.json({ message: 'Room not found or game already started' }, { status: 404 })
    }

    if (room.current_players >= room.max_players) {
      return NextResponse.json({ message: 'Room is full' }, { status: 400 })
    }

    // Check if player is already in the room
    const existingParticipant = await gameParticipants.findByGameAndPlayer(room.id, player_id)
    if (existingParticipant) {
      return NextResponse.json(room)
    }

    // Join the room
    await gameParticipants.create(room.id, player_id, false, 'villager')
    
    // Update player count
    await gameRooms.updatePlayerCount(room.id, room.current_players + 1)
    
    // Add join message
    await gameMessages.create(room.id, null, `Player joined the game`, 'system', null, true)

    return NextResponse.json(room)
  } catch (error) {
    console.error('Error joining room:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
