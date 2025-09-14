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

    // Create vote action
    await gameActions.create(gameId, player_id, 'vote', target_id, game.current_phase, game.day_number)

    // Add confirmation message
    await gameMessages.create(gameId, player_id, `You have voted to eliminate a player.`, 'system', player_id, false)

    // Check if all alive players have voted
    if (game.current_phase === 'day') {
      await checkAndProcessVotes(gameId, game)
    }

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
    const voteActions = votes.filter(vote => vote.action_type === 'vote')
    
    // Count unique voters
    const uniqueVoters = [...new Set(voteActions.map(vote => vote.player_id))]
    
    // Check if all alive players have voted
    const allPlayersVoted = aliveParticipants.every(player => 
      uniqueVoters.includes(player.player_id)
    )
    
    if (allPlayersVoted && aliveParticipants.length > 0) {
      // Process votes and eliminate player
      await processVotes(gameId, game, voteActions, participants)
    }
  } catch (error) {
    console.error('Error checking votes:', error)
  }
}

async function processVotes(gameId: number, game: any, votes: any[], participants: any[]) {
  try {
    // Count votes for each player
    const voteCounts: { [key: number]: number } = {}
    
    for (const vote of votes) {
      const targetId = vote.target_id
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
    }
    
    // Find player with most votes
    let maxVotes = 0
    let eliminatedPlayerId = null
    
    for (const [playerId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedPlayerId = parseInt(playerId)
      }
    }
    
    if (eliminatedPlayerId) {
      // Eliminate the player
      await gameParticipants.updateAlive(gameId, eliminatedPlayerId, false)
      
      const eliminatedPlayer = participants.find(p => p.player_id === eliminatedPlayerId)
      if (eliminatedPlayer) {
        await gameMessages.create(
          gameId, 
          null, 
          `${eliminatedPlayer.username} has been eliminated by vote!`, 
          'death', 
          null, 
          true
        )
        
        // Check if eliminated player was jester
        if (eliminatedPlayer.role === 'jester') {
          // Jester wins!
          await gameRooms.updateStatus(gameId, 'finished', 'finished', game.day_number)
          await gameMessages.create(
            gameId, 
            null, 
            `Game Over! The Jester wins by getting eliminated!`, 
            'system', 
            null, 
            true
          )
          return
        }
      }
    }
    
    // Check win conditions
    const aliveParticipants = participants.filter(p => p.is_alive)
    const aliveMafia = aliveParticipants.filter(p => ['mafia', 'bandit'].includes(p.role))
    const aliveVillagers = aliveParticipants.filter(p => !['mafia', 'bandit'].includes(p.role))
    
    let winner = null
    if (aliveMafia.length === 0) {
      winner = 'villagers'
    } else if (aliveMafia.length >= aliveVillagers.length) {
      winner = 'mafia'
    }
    
    if (winner) {
      // Game over
      await gameRooms.updateStatus(gameId, 'finished', 'finished', game.day_number)
      await gameMessages.create(
        gameId, 
        null, 
        `Game Over! ${winner === 'mafia' ? 'The Mafia' : 'The Villagers'} win!`, 
        'system', 
        null, 
        true
      )
    } else {
      // Transition to night phase
      const nextDay = game.day_number + 1
      await gameRooms.updateStatus(gameId, 'in_progress', 'night', nextDay)
      await gameMessages.create(
        gameId, 
        null, 
        `Night ${nextDay} begins. Special roles, make your moves.`, 
        'system', 
        null, 
        true
      )
    }
    
  } catch (error) {
    console.error('Error processing votes:', error)
  }
}
