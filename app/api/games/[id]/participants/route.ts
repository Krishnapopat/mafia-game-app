import { NextRequest, NextResponse } from 'next/server'
import { gameParticipants } from '@/lib/db/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const participants = await gameParticipants.findByGame(parseInt(params.id))
    return NextResponse.json(participants)
  } catch (error) {
    console.error('Error fetching participants:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
