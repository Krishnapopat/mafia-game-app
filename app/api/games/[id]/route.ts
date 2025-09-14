import { NextRequest, NextResponse } from 'next/server'
import { gameRooms } from '@/lib/db/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const room = await gameRooms.findById(parseInt(params.id))
    if (!room) {
      return NextResponse.json({ message: 'Room not found' }, { status: 404 })
    }
    return NextResponse.json(room)
  } catch (error) {
    console.error('Error fetching room:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
