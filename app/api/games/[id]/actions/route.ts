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

    // Handle immediate detective results - TRULY PRIVATE MESSAGE
    if (action_type === 'investigate' && (player.role === 'detective' || player.role === 'fake_detective')) {
      const participants = await gameParticipants.findByGame(gameId)
      const targetPlayer = participants.find(p => p.player_id === target_id)
      
      if (targetPlayer) {
        let result
        if (player.role === 'detective') {
          // Real detective gets truthful results
          const isMafia = ['mafia', 'bandit'].includes(targetPlayer.role)
          result = isMafia ? 'guilty' : 'innocent'
        } else {
          // Fake detective gets random results
          result = Math.random() < 0.5 ? 'guilty' : 'innocent'
        }
        
        // Send TRULY PRIVATE message only to the detective (no [PRIVATE] text)
        await gameMessages.create(
          gameId, 
          null, 
          `Investigation result: ${targetPlayer.username} is ${result}.`, 
          'private', 
          player_id, 
          false
        )
      }
    }

    // Add confirmation message (private)
    await gameMessages.create(gameId, null, `You have chosen your target for the night.`, 'private', player_id, false)

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
    if (uniquePlayersWhoHaveActed.length >= playersWithNightActions.length) {
      await processNightActions(gameId, game)
    }
  } catch (error) {
    console.error('Error checking phase transition:', error)
  }
}

async function processNightActions(gameId: number, game: any) {
  try {
    const participants = await gameParticipants.findByGame(gameId)
    const aliveParticipants = participants.filter(p => p.is_alive)
    
    // Get all night actions
    const nightActions = await gameActions.findByGameAndPhase(gameId, 'night', game.day_number)
    
    // Process kills
    const killActions = nightActions.filter(action => action.action_type === 'kill')
    const healActions = nightActions.filter(action => action.action_type === 'heal')
    
    let killedPlayer = null
    if (killActions.length > 0) {
      // Get the target of the first kill (all mafia should target the same)
      const targetId = killActions[0].target_id
      
      // Check if target was healed
      const wasHealed = healActions.some(heal => heal.target_id === targetId)
      
      if (!wasHealed) {
        killedPlayer = participants.find(p => p.player_id === targetId)
        if (killedPlayer) {
          await gameParticipants.updateAlive(gameId, targetId, false)
          await gameMessages.create(
            gameId, 
            null, 
            `${killedPlayer.username} was killed during the night!`, 
            'death', 
            null, 
            false
          )
          
          // Check win conditions immediately after kill
          const newAliveParticipants = participants.filter(p => p.is_alive)
          const aliveMafia = newAliveParticipants.filter(p => p.role === 'mafia')
          const aliveBandit = newAliveParticipants.filter(p => p.role === 'bandit')
          const aliveVillagers = newAliveParticipants.filter(p => ['villager', 'doctor', 'detective', 'fake_detective'].includes(p.role))
          
          let winner = null
          if (aliveMafia.length === 0 && aliveBandit.length === 0) {
            winner = 'Villagers'
          } else if ((aliveMafia.length + aliveBandit.length) >= aliveVillagers.length) {
            winner = 'Mafia'
          }
          
          if (winner) {
            await gameRooms.updateStatus(gameId, 'finished', 'finished', game.day_number)
            await gameRooms.updateWinner(gameId, winner)
            await gameMessages.create(
              gameId, 
              null, 
              `Game Over - ${winner} win!`, 
              'system', 
              null, 
              false
            )
            return // Exit early if game is over
          }
        }
      } else {
        await gameMessages.create(
          gameId, 
          null, 
          `Someone was attacked but saved by the doctor!`, 
          'system', 
          null, 
          false
        )
      }
    }
    
    // Clear night actions
    await gameActions.clearByGameAndPhase(gameId, game.day_number)
    
    // Only continue to day phase if game is not over
    const currentGame = await gameRooms.findById(gameId)
    if (currentGame.status !== 'finished') {
      // Transition to day phase
      await gameRooms.updateStatus(gameId, 'in_progress', 'day', game.day_number)
      await gameMessages.create(
        gameId, 
        null, 
        `Day ${game.day_number} begins. Discuss and vote to eliminate a player.`, 
        'system', 
        null, 
        false
      )
    }
  } catch (error) {
    console.error('Error processing night actions:', error)
  }
}
