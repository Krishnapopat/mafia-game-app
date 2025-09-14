import { NextRequest, NextResponse } from 'next/server'
import { gameRooms } from '@/lib/db/database'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const roomId = parseInt(params.id)
    
    if (isNaN(roomId)) {
      return NextResponse.json({ message: 'Invalid room ID' }, { status: 400 })
    }

    // Check if room exists
    const room = await gameRooms.findById(roomId)
    
    if (!room) {
      return NextResponse.json({ message: 'Room not found' }, { status: 404 })
    }

    // Delete the room and all related data
    await gameRooms.delete(roomId)

    return NextResponse.json({ message: 'Room deleted successfully' })
  } catch (error) {
    console.error('Error deleting room:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
