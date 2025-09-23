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

    // ALL ALIVE PLAYERS CAN VOTE - NO ROLE RESTRICTIONS
    // Create vote action
    await gameActions.create(gameId, player_id, 'vote', target_id, 'day', game.day_number)

    // Add confirmation message (private)
    await gameMessages.create(gameId, null, `You have voted to eliminate someone.`, 'private', player_id, false)

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
    const dayVotes = await gameActions.findByGameAndPhase(gameId, 'day', game.day_number)
    const voteActions = dayVotes.filter(action => action.action_type === 'vote')
    
    // Count unique voters
    const uniqueVoters = [...new Set(voteActions.map(vote => vote.player_id))]
    
    // Check if all alive players have voted
    if (uniqueVoters.length >= aliveParticipants.length) {
      await processVotes(gameId, game)
    }
  } catch (error) {
    console.error('Error checking votes:', error)
  }
}

async function processVotes(gameId: number, game: any) {
  try {
    const participants = await gameParticipants.findByGame(gameId)
    const aliveParticipants = participants.filter(p => p.is_alive)
    
    // Get all votes for this day
    const dayVotes = await gameActions.findByGameAndPhase(gameId, 'day', game.day_number)
    const voteActions = dayVotes.filter(action => action.action_type === 'vote')
    
    // Count votes for each player
    const voteCounts: { [key: number]: number } = {}
    voteActions.forEach(vote => {
      voteCounts[vote.target_id] = (voteCounts[vote.target_id] || 0) + 1
    })
    
    // Find player with most votes
    let maxVotes = 0
    let eliminatedPlayer = null
    
    Object.entries(voteCounts).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedPlayer = participants.find(p => p.player_id === parseInt(playerId))
      }
    })
    
    // Check for ties
    const tiedPlayers = Object.entries(voteCounts)
      .filter(([_, count]) => count === maxVotes)
      .map(([playerId, _]) => participants.find(p => p.player_id === parseInt(playerId)))
    
    if (tiedPlayers.length > 1) {
      // Tie - no one is eliminated
      await gameMessages.create(
        gameId, 
        null, 
        `Vote resulted in a tie. No one is eliminated.`, 
        'system', 
        null, 
        false
      )
    } else if (eliminatedPlayer) {
      // Eliminate the player with most votes
      await gameParticipants.updateAlive(gameId, eliminatedPlayer.player_id, false)
      await gameMessages.create(
        gameId, 
        null, 
        `${eliminatedPlayer.username} has been eliminated by vote!`, 
        'death', 
        null, 
        false
      )
    }
    
    // Clear day votes
    await gameActions.clearByGameAndPhase(gameId, game.day_number)
    
    // Check win conditions
    const newAliveParticipants = participants.filter(p => p.is_alive)
    const aliveMafia = newAliveParticipants.filter(p => p.role === 'mafia')
    const aliveVillagers = newAliveParticipants.filter(p => ['villager', 'doctor', 'detective', 'fake_detective'].includes(p.role))
    const aliveJester = newAliveParticipants.filter(p => p.role === 'jester')
    
    let winner = null
    if (aliveMafia.length === 0) {
      winner = 'Villagers'
    } else if (aliveMafia.length >= aliveVillagers.length) {
      winner = 'Mafia'
    } else if (aliveJester.length > 0 && eliminatedPlayer && eliminatedPlayer.role === 'jester') {
      winner = 'Jester'
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
        `Night ${nextDay} begins. Mafia, Doctor, and Detectives, choose your actions.`, 
        'system', 
        null, 
        false
      )
    }
  } catch (error) {
    console.error('Error processing votes:', error)
  }
}
