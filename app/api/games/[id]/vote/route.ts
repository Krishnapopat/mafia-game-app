import { NextRequest, NextResponse } from 'next/server'
import { gameActions, gameMessages } from '@/lib/db/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { target_id, player_id } = await request.json()
    
    if (!target_id || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    const gameId = parseInt(params.id)
    
    // Create vote action
    await gameActions.create(gameId, player_id, 'vote', target_id, 'day', 1)

    // Add public vote message
    await gameMessages.create(gameId, player_id, `Player voted to eliminate someone.`, 'vote', null, true)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
