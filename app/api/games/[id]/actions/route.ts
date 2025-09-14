import { NextRequest, NextResponse } from 'next/server'
import { gameActions, gameMessages, gameRooms, gameParticipants } from '@/lib/db/database'

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
    
    // Get current game state
    const game = await gameRooms.findById(gameId)
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 })
    }

    // Get player info
    const player = await gameParticipants.findByGameAndPlayer(gameId, player_id)
    if (!player) {
      return NextResponse.json({ message: 'Player not found in game' }, { status: 404 })
    }

    // Handle mafia coordination
    if (action_type === 'kill' && player.role === 'mafia') {
      const mafiaKills = await gameActions.findByGameAndPhase(gameId, 'night', game.day_number)
      const existingKills = mafiaKills.filter(action => action.action_type === 'kill')
      
      if (existingKills.length > 0) {
        // Check if all mafia are targeting the same player
        const allTargetSame = existingKills.every(kill => kill.target_id === target_id)
        if (!allTargetSame) {
          return NextResponse.json({ 
            message: 'Mafia members must agree on the same target. Coordinate with your team!' 
          }, { status: 400 })
        }
      }
    }

    // Create action
    await gameActions.create(gameId, player_id, action_type, target_id, game.current_phase, game.day_number)

    // Handle immediate detective results
    if (action_type === 'investigate' && player.role === 'detective') {
      const participants = await gameParticipants.findByGame(gameId)
      const targetPlayer = participants.find(p => p.player_id === target_id)
      
      if (targetPlayer) {
        const isMafia = ['mafia', 'bandit'].includes(targetPlayer.role)
        const result = isMafia ? 'guilty' : 'innocent'
        
        await gameMessages.create(
          gameId, 
          player_id, 
          `Investigation result: ${targetPlayer.username} is ${result}.`, 
          'system', 
          player_id, 
          false
        )
      }
    }

    // Add confirmation message
    await gameMessages.create(gameId, player_id, `You have chosen your target for the night.`, 'system', player_id, false)

    // Check if all players with night actions have acted
    if (game.current_phase === 'night') {
      await checkAndTransitionPhase(gameId, game)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error performing action:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

async function checkAndTransitionPhase(gameId: number, game: any) {
  try {
    // Get all participants
    const participants = await gameParticipants.findByGame(gameId)
    const aliveParticipants = participants.filter(p => p.is_alive)
    
    // Get all night actions for this phase
    const nightActions = await gameActions.findByGameAndPhase(gameId, 'night', game.day_number)
    
    // Define which roles have night actions
    const nightActionRoles = ['mafia', 'doctor', 'detective', 'fake_detective']
    
    // Count how many players with night actions have acted
    const playersWithNightActions = aliveParticipants.filter(p => 
      nightActionRoles.includes(p.role)
    )
    
    const playersWhoHaveActed = nightActions.map(action => action.player_id)
    const uniquePlayersWhoHaveActed = [...new Set(playersWhoHaveActed)]
    
    // Check if all players with night actions have acted
    const allNightActionsComplete = playersWithNightActions.every(player => 
      uniquePlayersWhoHaveActed.includes(player.player_id)
    )
    
    if (allNightActionsComplete && playersWithNightActions.length > 0) {
      // Process night actions and transition to day
      await processNightActions(gameId, game, nightActions, participants)
    }
  } catch (error) {
    console.error('Error checking phase transition:', error)
  }
}

async function processNightActions(gameId: number, game: any, nightActions: any[], participants: any[]) {
  try {
    // Process mafia kills
    const mafiaKills = nightActions.filter(action => action.action_type === 'kill')
    const doctorHeals = nightActions.filter(action => action.action_type === 'heal')
    
    let killedPlayers: number[] = []
    
    // Process each mafia kill (only if all mafia agreed on the same target)
    if (mafiaKills.length > 0) {
      const targetId = mafiaKills[0].target_id // All mafia should have the same target
      
      // Check if doctor healed this target
      const wasHealed = doctorHeals.some(heal => heal.target_id === targetId)
      
      if (!wasHealed) {
        // Player dies
        await gameParticipants.updateAlive(gameId, targetId, false)
        killedPlayers.push(targetId)
        
        const killedPlayer = participants.find(p => p.player_id === targetId)
        if (killedPlayer) {
          await gameMessages.create(
            gameId, 
            null, 
            `${killedPlayer.username} has been eliminated during the night!`, 
            'death', 
            null, 
            true
          )
        }
      } else {
        // Player was healed
        const healedPlayer = participants.find(p => p.player_id === targetId)
        if (healedPlayer) {
          await gameMessages.create(
            gameId, 
            null, 
            `${healedPlayer.username} was protected by the doctor!`, 
            'system', 
            null, 
            true
          )
        }
      }
    }
    
    // Process fake detective investigations (random results)
    const fakeInvestigations = nightActions.filter(action => 
      action.action_type === 'investigate' && 
      (action.player_id && participants.find(p => p.player_id === action.player_id)?.role === 'fake_detective')
    )
    
    for (const investigation of fakeInvestigations) {
      const targetId = investigation.target_id
      const targetPlayer = participants.find(p => p.player_id === targetId)
      const fakeDetective = participants.find(p => p.player_id === investigation.player_id)
      
      if (targetPlayer && fakeDetective) {
        // Random result for fake detective
        const randomResult = Math.random() < 0.5 ? 'guilty' : 'innocent'
        
        await gameMessages.create(
          gameId, 
          investigation.player_id, 
          `Investigation result: ${targetPlayer.username} is ${randomResult}.`, 
          'system', 
          investigation.player_id, 
          false
        )
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
      // Transition to day phase
      await gameRooms.updateStatus(gameId, 'in_progress', 'day', game.day_number)
      await gameMessages.create(
        gameId, 
        null, 
        `Day ${game.day_number} begins. Discuss and vote to eliminate a suspect.`, 
        'system', 
        null, 
        true
      )
    }
    
  } catch (error) {
    console.error('Error processing night actions:', error)
  }
}
