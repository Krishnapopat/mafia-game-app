import { NextRequest, NextResponse } from 'next/server'
import { gameActions, gameMessages, gameRooms, gameParticipants } from '@/lib/db/database'

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
    
    // Get current game state
    const game = await gameRooms.findById(gameId)
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 })
    }

    if (game.current_phase !== 'day') {
      return NextResponse.json({ message: 'Voting is only allowed during day phase' }, { status: 400 })
    }

    // Get player info
    const player = await gameParticipants.findByGameAndPlayer(gameId, player_id)
    if (!player) {
      return NextResponse.json({ message: 'Player not found in game' }, { status: 404 })
    }

    if (!player.is_alive) {
      return NextResponse.json({ message: 'Dead players cannot vote' }, { status: 400 })
    }

    // Create vote action
    await gameActions.create(gameId, player_id, 'vote', target_id, 'day', game.day_number)

    // Add confirmation message
    await gameMessages.create(gameId, player_id, `You have voted to eliminate someone.`, 'private', player_id, false)

    // Check if all alive players have voted
    await checkAndProcessVotes(gameId, game)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

async function checkAndProcessVotes(gameId: number, game: any) {
  try {
    // Get all participants
    const participants = await gameParticipants.findByGame(gameId)
    const aliveParticipants = participants.filter(p => p.is_alive)
    
    // Get all votes for this day
    const votes = await gameActions.findByGameAndPhase(gameId, 'day', game.day_number)
    
    // Check if all alive players have voted
    if (votes.length >= aliveParticipants.length) {
      await processVotes(gameId, game, votes)
    }
  } catch (error) {
    console.error('Error checking votes:', error)
  }
}

async function processVotes(gameId: number, game: any, votes: any[]) {
  try {
    // Count votes for each player
    const voteCounts: { [key: number]: number } = {}
    votes.forEach(vote => {
      voteCounts[vote.target_id] = (voteCounts[vote.target_id] || 0) + 1
    })

    // Find player with most votes
    let maxVotes = 0
    let eliminatedPlayerId = null
    
    Object.entries(voteCounts).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedPlayerId = parseInt(playerId)
      }
    })

    if (eliminatedPlayerId) {
      const participants = await gameParticipants.findByGame(gameId)
      const eliminatedPlayer = participants.find(p => p.player_id === eliminatedPlayerId)
      
      if (eliminatedPlayer) {
        await gameParticipants.updateAlive(gameId, eliminatedPlayerId, false)
        
        // Check if Jester was eliminated
        if (eliminatedPlayer.role === 'jester') {
          await gameRooms.updateStatus(gameId, 'finished', 'finished', game.day_number)
          await gameMessages.create(
            gameId, 
            null, 
            `${eliminatedPlayer.username} was eliminated! The Jester wins!`, 
            'death', 
            null, 
            false
          )
          return
        }
        
        await gameMessages.create(
          gameId, 
          null, 
          `${eliminatedPlayer.username} was eliminated by vote!`, 
          'death', 
          null, 
          false
        )
      }
    }

    // Clear day votes
    await gameActions.clearByGameAndPhase(gameId, game.day_number)
    
    // Check win conditions
    const participants = await gameParticipants.findByGame(gameId)
    const aliveParticipants = participants.filter(p => p.is_alive)
    const aliveMafia = aliveParticipants.filter(p => p.role === 'mafia')
    const aliveVillagers = aliveParticipants.filter(p => ['villager', 'doctor', 'detective', 'fake_detective'].includes(p.role))
    
    let winner = null
    if (aliveMafia.length === 0) {
      winner = 'Villagers'
    } else if (aliveMafia.length >= aliveVillagers.length) {
      winner = 'Mafia'
    }
    
    if (winner) {
      await gameRooms.updateStatus(gameId, 'finished', 'finished', game.day_number)
      await gameMessages.create(
        gameId, 
        null, 
        `Game Over - ${winner} win!`, 
        'system', 
        null, 
        false
      )
    } else {
      // Transition to night phase
      const nextDay = game.day_number + 1
      await gameRooms.updateStatus(gameId, 'in_progress', 'night', nextDay)
      await gameMessages.create(
        gameId, 
        null, 
        `Night ${nextDay} begins.`, 
        'system', 
        null, 
        false
      )
    }
  } catch (error) {
    console.error('Error processing votes:', error)
  }
}
