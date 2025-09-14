import { NextRequest, NextResponse } from 'next/server'
import { gameMessages } from '@/lib/db/database'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const messages = await gameMessages.findByGame(parseInt(params.id))
    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { message, player_id } = await request.json()
    
    if (!message || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    await gameMessages.create(parseInt(params.id), player_id, message, 'chat', null, true)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
