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

    // Get current participant count
    const currentParticipants = await gameParticipants.findByGame(game_id)
    const currentCount = currentParticipants.length

    if (currentCount >= game.max_players) {
      return NextResponse.json({ message: 'Room is full' }, { status: 400 })
    }

    // Create participant
    await gameParticipants.create(game_id, player_id, 'villager', is_host || false)

    // Update player count
    await gameRooms.updatePlayerCount(game_id, currentCount + 1)

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

    // Get participant info
    const participant = await gameParticipants.findByGameAndPlayer(game_id, player_id)
    if (!participant) {
      return NextResponse.json({ message: 'Player not in game' }, { status: 404 })
    }

    // Remove participant
    await gameParticipants.remove(game_id, player_id)

    // Get updated participant count
    const remainingParticipants = await gameParticipants.findByGame(game_id)
    const newCount = remainingParticipants.length

    // Update player count
    await gameRooms.updatePlayerCount(game_id, newCount)

    // If the leaving player was the host, transfer host to another player
    if (participant.is_host && remainingParticipants.length > 0) {
      const newHost = remainingParticipants[0]
      await gameParticipants.updateHost(game_id, newHost.player_id, true)
      await gameRooms.updateHost(game_id, newHost.player_id)
      
      // Add host transfer message
      await gameMessages.create(
        game_id, 
        null, 
        `${newHost.username} is now the host!`, 
        'system', 
        null, 
        true
      )
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
