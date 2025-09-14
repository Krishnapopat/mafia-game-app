import { NextRequest, NextResponse } from 'next/server'
import { gameActions, gameMessages } from '@/lib/db/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { action_type, target_id, player_id } = await request.json()
    
    if (!action_type || !target_id || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    const gameId = parseInt(params.id)
    
    // Create action
    await gameActions.create(gameId, player_id, action_type, target_id, 'night', 1)

    // Add confirmation message
    await gameMessages.create(gameId, player_id, `You have chosen your target for the night.`, 'system', player_id, false)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error performing action:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
