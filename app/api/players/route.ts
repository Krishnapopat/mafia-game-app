import { NextRequest, NextResponse } from 'next/server'
import { players } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    
    if (!username || username.trim().length < 3) {
      return NextResponse.json({ message: 'Username must be at least 3 characters' }, { status: 400 })
    }

    // Temporarily disable cleanup to prevent foreign key constraint errors
    // await players.deleteOldPlayers()

    // Check if username already exists
    const existingPlayer = await players.findByUsername(username.trim())
    if (existingPlayer) {
      return NextResponse.json({ message: 'Username already taken' }, { status: 400 })
    }

    // Create new player
    const player = await players.create(username.trim())
    return NextResponse.json(player)
  } catch (error) {
    console.error('Error creating player:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
