import { NextRequest, NextResponse } from 'next/server'
import { gameRooms, gameParticipants, gameMessages } from '@/lib/db/database'

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

    // Get all participants before deleting
    const participants = await gameParticipants.findByGame(roomId)
    
    // Add room deletion message for all participants
    for (const participant of participants) {
      await gameMessages.create(
        roomId, 
        null, 
        `Room "${room.name}" has been deleted by the host!`, 
        'system', 
        null, 
        true
      )
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
