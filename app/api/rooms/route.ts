import { NextRequest, NextResponse } from 'next/server'
import { gameRooms, generateRoomCode } from '@/lib/db/database'

export async function GET() {
  try {
    const rooms = await gameRooms.findAllWaiting()
    return NextResponse.json(rooms)
  } catch (error) {
    console.error('Error fetching rooms:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, host_id, max_players, role_config, doctor_can_heal_same_twice } = await request.json()
    
    if (!name || !host_id || !max_players) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    const roomCode = generateRoomCode()
    const room = await gameRooms.create(
      roomCode,
      name,
      host_id,
      max_players,
      role_config,
      doctor_can_heal_same_twice
    )

    return NextResponse.json(room)
  } catch (error) {
    console.error('Error creating room:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
