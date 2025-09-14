import { NextRequest, NextResponse } from 'next/server'
import { gameParticipants, gameRooms, gameMessages, players } from '@/lib/db/database'

export async function POST(request: NextRequest) {
  try {
    const { game_id, player_id, is_host } = await request.json()
    
    if (!game_id || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Check if player is already in the game
    const existingParticipant = await gameParticipants.findByGameAndPlayer(game_id, player_id)
    if (existingParticipant) {
      return NextResponse.json({ message: 'Player already in game' }, { status: 400 })
    }

    // Get player info
    const player = await players.findById(player_id)
    if (!player) {
      return NextResponse.json({ message: 'Player not found' }, { status: 404 })
    }

    // Check if game exists and is waiting
    const game = await gameRooms.findById(game_id)
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'waiting') {
      return NextResponse.json({ message: 'Game has already started' }, { status: 400 })
    }

    if (game.current_players >= game.max_players) {
      return NextResponse.json({ message: 'Game is full' }, { status: 400 })
    }

    // Create participant
    await gameParticipants.create(game_id, player_id, 'villager', is_host || false)

    // Update player count
    await gameRooms.updatePlayerCount(game_id, game.current_players + 1)

    // Add join message
    await gameMessages.create(
      game_id, 
      null, 
      `${player.username} joined the game!`, 
      'system', 
      null, 
      true
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error joining game:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { game_id, player_id } = await request.json()
    
    if (!game_id || !player_id) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 })
    }

    // Get player info before removing
    const player = await players.findById(player_id)
    if (!player) {
      return NextResponse.json({ message: 'Player not found' }, { status: 404 })
    }

    // Get game info
    const game = await gameRooms.findById(game_id)
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 })
    }

    // Remove participant (this will need to be implemented in the database module)
    // For now, we'll just update the player count and add a message
    
    // Update player count
    if (game.current_players > 0) {
      await gameRooms.updatePlayerCount(game_id, game.current_players - 1)
    }

    // Add leave message
    await gameMessages.create(
      game_id, 
      null, 
      `${player.username} left the game!`, 
      'system', 
      null, 
      true
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error leaving game:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
