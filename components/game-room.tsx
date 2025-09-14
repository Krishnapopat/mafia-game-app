"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Users,
  Crown,
  Play,
  MessageCircle,
  Clock,
  Skull,
  Shield,
  Search,
  Zap,
  ArrowLeft,
  Target,
  Vote,
} from "lucide-react"
import { useRouter } from "next/navigation"

interface GameRoomProps {
  gameId: string
}

interface Player {
  id: string
  username: string
}

interface GameParticipant {
  id: string
  player_id: string
  role: string
  is_alive: boolean
  is_host: boolean
  players: Player
}

interface GameRoom {
  id: string
  room_code: string
  name: string
  status: string
  current_phase: string
  day_number: number
  max_players: number
  current_players: number
  host_id: string
  phase_end_time: string | null
  winner?: string
}

interface GameMessage {
  id: string
  message: string
  message_type: string
  created_at: string
  players: Player | null
  visible_to_player_id?: string
  is_visible_to_all?: boolean
}

const ROLE_ICONS = {
  villager: Users,
  mafia: Skull,
  doctor: Shield,
  detective: Search,
  jester: Zap,
  bandit: Zap,
}

const ROLE_COLORS = {
  villager: "bg-blue-600",
  mafia: "bg-red-600",
  doctor: "bg-green-600",
  detective: "bg-purple-600",
  jester: "bg-yellow-600",
  bandit: "bg-orange-600",
}

export function GameRoom({ gameId }: GameRoomProps) {
  const [gameRoom, setGameRoom] = useState<GameRoom | null>(null)
  const [participants, setParticipants] = useState<GameParticipant[]>([])
  const [messages, setMessages] = useState<GameMessage[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<GameParticipant | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [hasActed, setHasActed] = useState(false)
  const [votes, setVotes] = useState<{ [key: string]: string }>({})
  const [playerActions, setPlayerActions] = useState<{ [key: string]: any }>({})
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const fetchGameData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Get game room
      const { data: roomData } = await supabase.from("game_rooms").select("*").eq("id", gameId).single()

      setGameRoom(roomData)

      // Get participants
      const { data: participantsData } = await supabase
        .from("game_participants")
        .select(`
          *,
          players (id, username)
        `)
        .eq("game_id", gameId)
        .order("joined_at")

      setParticipants(participantsData || [])

      // Find current player
      const currentParticipant = participantsData?.find((p) => p.player_id === user.id)
      setCurrentPlayer(currentParticipant || null)

      // Get messages
      const { data: messagesData } = await supabase
        .from("game_messages")
        .select(`
          *,
          players (id, username)
        `)
        .eq("game_id", gameId)
        .order("created_at")

      setMessages(messagesData || [])

      const { data: actionsData } = await supabase
        .from("game_actions")
        .select("*")
        .eq("game_id", gameId)
        .eq("phase", roomData?.current_phase || "night")
        .eq("day_number", roomData?.day_number || 1)

      const actionsMap: { [key: string]: any } = {}
      actionsData?.forEach((action) => {
        actionsMap[action.player_id] = action
      })
      setPlayerActions(actionsMap)

      // Check if current player has acted
      const currentPlayerAction = actionsData?.find((a) => a.player_id === user.id)
      setHasActed(!!currentPlayerAction)
      if (currentPlayerAction) {
        setSelectedTarget(currentPlayerAction.target_id)
      }
    }

    fetchGameData()

    // Subscribe to real-time updates
    const gameSubscription = supabase
      .channel(`game_${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${gameId}` },
        fetchGameData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_participants", filter: `game_id=eq.${gameId}` },
        fetchGameData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_messages", filter: `game_id=eq.${gameId}` },
        fetchGameData,
      )
      .subscribe()

    return () => {
      gameSubscription.unsubscribe()
    }
  }, [gameId])

  // Timer countdown
  useEffect(() => {
    if (!gameRoom?.phase_end_time) return

    const interval = setInterval(() => {
      const endTime = new Date(gameRoom.phase_end_time!).getTime()
      const now = new Date().getTime()
      const difference = endTime - now

      if (difference > 0) {
        setTimeLeft(Math.floor(difference / 1000))
      } else {
        setTimeLeft(0)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [gameRoom?.phase_end_time])

  const handleStartGame = async () => {
    if (!currentPlayer?.is_host || !gameRoom) return

    const supabase = createClient()

    // Assign roles randomly
    const roles = ["mafia", "mafia", "doctor", "detective", "villager", "villager", "villager", "jester"]
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5)

    try {
      // Update participants with roles
      for (let i = 0; i < participants.length; i++) {
        const role = shuffledRoles[i] || "villager"
        await supabase.from("game_participants").update({ role }).eq("id", participants[i].id)
      }

      // Update game status
      await supabase
        .from("game_rooms")
        .update({
          status: "night",
          current_phase: "night",
          day_number: 1,
          phase_end_time: new Date(Date.now() + 60000).toISOString(), // 1 minute
        })
        .eq("id", gameId)

      // Add system message
      await supabase.from("game_messages").insert({
        game_id: gameId,
        message: "The game has started! Night phase begins. Mafia, choose your target.",
        message_type: "system",
      })
    } catch (error) {
      console.error("Error starting game:", error)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !currentPlayer) return

    const supabase = createClient()

    try {
      await supabase.from("game_messages").insert({
        game_id: gameId,
        player_id: currentPlayer.player_id,
        message: newMessage.trim(),
        message_type: "chat",
      })

      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  const handleNightAction = async () => {
    if (!currentPlayer || !selectedTarget || !gameRoom) return

    const supabase = createClient()
    let actionType = ""

    switch (currentPlayer.role) {
      case "mafia":
        actionType = "kill"
        break
      case "doctor":
        actionType = "heal"
        break
      case "detective":
        actionType = "investigate"
        break
      default:
        return
    }

    try {
      await supabase.from("game_actions").insert({
        game_id: gameId,
        player_id: currentPlayer.player_id,
        action_type: actionType,
        target_id: selectedTarget,
        phase: gameRoom.current_phase,
        day_number: gameRoom.day_number,
      })

      setHasActed(true)

      // Add system message for confirmation
      await supabase.from("game_messages").insert({
        game_id: gameId,
        message: `You have chosen your target for the night.`,
        message_type: "system",
        player_id: currentPlayer.player_id,
        is_visible_to_all: false,
      })
    } catch (error) {
      console.error("Error performing night action:", error)
    }
  }

  const handleVote = async () => {
    if (!currentPlayer || !selectedTarget || !gameRoom) return

    const supabase = createClient()

    try {
      // Remove previous vote if exists
      await supabase
        .from("game_actions")
        .delete()
        .eq("game_id", gameId)
        .eq("player_id", currentPlayer.player_id)
        .eq("action_type", "vote")
        .eq("phase", gameRoom.current_phase)
        .eq("day_number", gameRoom.day_number)

      // Add new vote
      await supabase.from("game_actions").insert({
        game_id: gameId,
        player_id: currentPlayer.player_id,
        action_type: "vote",
        target_id: selectedTarget,
        phase: gameRoom.current_phase,
        day_number: gameRoom.day_number,
      })

      setHasActed(true)

      // Add public message about vote
      const targetPlayer = participants.find((p) => p.player_id === selectedTarget)
      await supabase.from("game_messages").insert({
        game_id: gameId,
        message: `${currentPlayer.players.username} voted to eliminate ${targetPlayer?.players.username}`,
        message_type: "vote",
      })
    } catch (error) {
      console.error("Error voting:", error)
    }
  }

  const handlePhaseTransition = async () => {
    if (!currentPlayer?.is_host || !gameRoom) return

    const supabase = createClient()

    try {
      if (gameRoom.current_phase === "night") {
        // Process night actions
        const { data: nightActions } = await supabase
          .from("game_actions")
          .select("*")
          .eq("game_id", gameId)
          .eq("phase", "night")
          .eq("day_number", gameRoom.day_number)

        // Find kill target
        const killAction = nightActions?.find((a) => a.action_type === "kill")
        const healAction = nightActions?.find((a) => a.action_type === "heal")
        const investigateAction = nightActions?.find((a) => a.action_type === "investigate")

        if (killAction && (!healAction || healAction.target_id !== killAction.target_id)) {
          // Kill the target
          await supabase
            .from("game_participants")
            .update({ is_alive: false })
            .eq("game_id", gameId)
            .eq("player_id", killAction.target_id)

          const victim = participants.find((p) => p.player_id === killAction.target_id)
          await supabase.from("game_messages").insert({
            game_id: gameId,
            message: `${victim?.players.username} was eliminated during the night.`,
            message_type: "death",
          })
        }

        // Process investigation
        if (investigateAction) {
          const target = participants.find((p) => p.player_id === investigateAction.target_id)
          const investigator = participants.find((p) => p.player_id === investigateAction.player_id)

          await supabase.from("game_messages").insert({
            game_id: gameId,
            player_id: investigateAction.player_id,
            message: `Investigation result: ${target?.players.username} is a ${target?.role}.`,
            message_type: "system",
            visible_to_player_id: investigateAction.player_id,
            is_visible_to_all: false,
          })
        }

        const { data: winCheck } = await supabase.rpc("check_win_condition", { game_room_id: gameId })

        if (winCheck && winCheck !== "ongoing") {
          await supabase.rpc("end_game", { game_room_id: gameId, winner: winCheck })
          return
        }

        // Transition to day
        await supabase
          .from("game_rooms")
          .update({
            current_phase: "day",
            status: "day",
            phase_end_time: new Date(Date.now() + 120000).toISOString(), // 2 minutes
          })
          .eq("id", gameId)
      } else if (gameRoom.current_phase === "day") {
        // Process votes
        const { data: votesData } = await supabase
          .from("game_actions")
          .select("*")
          .eq("game_id", gameId)
          .eq("action_type", "vote")
          .eq("phase", "day")
          .eq("day_number", gameRoom.day_number)

        // Count votes
        const voteCount: { [key: string]: number } = {}
        votesData?.forEach((vote) => {
          voteCount[vote.target_id] = (voteCount[vote.target_id] || 0) + 1
        })

        // Find player with most votes
        let maxVotes = 0
        let eliminatedPlayer = null
        for (const [playerId, count] of Object.entries(voteCount)) {
          if (count > maxVotes) {
            maxVotes = count
            eliminatedPlayer = playerId
          }
        }

        if (eliminatedPlayer && maxVotes > 0) {
          await supabase
            .from("game_participants")
            .update({ is_alive: false })
            .eq("game_id", gameId)
            .eq("player_id", eliminatedPlayer)

          const victim = participants.find((p) => p.player_id === eliminatedPlayer)
          await supabase.from("game_messages").insert({
            game_id: gameId,
            message: `${victim?.players.username} was eliminated by vote. They were a ${victim?.role}.`,
            message_type: "death",
          })

          const { data: winCheck } = await supabase.rpc("check_win_condition", { game_room_id: gameId })

          if (winCheck && winCheck !== "ongoing") {
            await supabase.rpc("end_game", { game_room_id: gameId, winner: winCheck })
            return
          }
        }

        // Transition to night
        await supabase
          .from("game_rooms")
          .update({
            current_phase: "night",
            status: "night",
            day_number: gameRoom.day_number + 1,
            phase_end_time: new Date(Date.now() + 60000).toISOString(), // 1 minute
          })
          .eq("id", gameId)
      }
    } catch (error) {
      console.error("Error transitioning phase:", error)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getAvailableTargets = () => {
    if (!currentPlayer || !currentPlayer.is_alive) return []

    if (gameRoom.current_phase === "night") {
      if (currentPlayer.role === "mafia") {
        return participants.filter((p) => p.is_alive && p.role !== "mafia" && p.player_id !== currentPlayer.player_id)
      } else if (currentPlayer.role === "doctor" || currentPlayer.role === "detective") {
        return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
      }
    } else if (gameRoom.current_phase === "day") {
      return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
    }

    return []
  }

  const availableTargets = getAvailableTargets()
  const canAct = currentPlayer.is_alive && !hasActed && availableTargets.length > 0

  if (!gameRoom || !currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  const RoleIcon = ROLE_ICONS[currentPlayer.role as keyof typeof ROLE_ICONS] || Users
  const roleColor = ROLE_COLORS[currentPlayer.role as keyof typeof ROLE_COLORS] || "bg-gray-600"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('/placeholder-raawb.png')] opacity-5"></div>
      <div className="relative z-10 container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Leave Game
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">{gameRoom.name}</h1>
              <p className="text-slate-300">Room Code: {gameRoom.room_code}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {timeLeft !== null && gameRoom.status !== "waiting" && (
              <div className="flex items-center gap-2 text-white">
                <Clock className="w-5 h-5" />
                <span className="text-xl font-mono">{formatTime(timeLeft)}</span>
              </div>
            )}
            <Badge className={`${roleColor} text-white`}>
              <RoleIcon className="w-4 h-4 mr-1" />
              {currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Players Panel */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Players ({participants.length}/{gameRoom.max_players})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {participants.map((participant) => {
                    const ParticipantRoleIcon = ROLE_ICONS[participant.role as keyof typeof ROLE_ICONS] || Users
                    const participantRoleColor =
                      ROLE_COLORS[participant.role as keyof typeof ROLE_COLORS] || "bg-gray-600"

                    return (
                      <div
                        key={participant.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          participant.is_alive ? "bg-slate-700/30" : "bg-red-900/20"
                        } border border-slate-600 ${
                          selectedTarget === participant.player_id ? "ring-2 ring-red-500" : ""
                        } ${
                          canAct && availableTargets.some((t) => t.player_id === participant.player_id)
                            ? "cursor-pointer hover:bg-slate-600/30"
                            : ""
                        }`}
                        onClick={() => {
                          if (canAct && availableTargets.some((t) => t.player_id === participant.player_id)) {
                            setSelectedTarget(participant.player_id)
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {participant.is_host && <Crown className="w-4 h-4 text-yellow-400" />}
                          <span className={`${participant.is_alive ? "text-white" : "text-slate-500 line-through"}`}>
                            {participant.players.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!participant.is_alive && <Skull className="w-4 h-4 text-red-400" />}
                          {gameRoom.status !== "waiting" && (
                            <Badge size="sm" className={`${participantRoleColor} text-white`}>
                              <ParticipantRoleIcon className="w-3 h-3" />
                            </Badge>
                          )}
                          {selectedTarget === participant.player_id && canAct && (
                            <Target className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {currentPlayer.is_host && gameRoom.status === "waiting" && participants.length >= 4 && (
                  <Button onClick={handleStartGame} className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white">
                    <Play className="w-4 h-4 mr-2" />
                    Start Game
                  </Button>
                )}

                {canAct && selectedTarget && (
                  <div className="mt-4 space-y-2">
                    {gameRoom.current_phase === "night" && (
                      <Button
                        onClick={handleNightAction}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {currentPlayer.role === "mafia" && "Kill Target"}
                        {currentPlayer.role === "doctor" && "Heal Target"}
                        {currentPlayer.role === "detective" && "Investigate Target"}
                      </Button>
                    )}
                    {gameRoom.current_phase === "day" && (
                      <Button onClick={handleVote} className="w-full bg-red-600 hover:bg-red-700 text-white">
                        <Vote className="w-4 h-4 mr-2" />
                        Vote to Eliminate
                      </Button>
                    )}
                  </div>
                )}

                {hasActed && (
                  <div className="mt-4 p-3 bg-green-900/30 border border-green-600 rounded-lg">
                    <p className="text-green-200 text-sm text-center">
                      {gameRoom.current_phase === "night" ? "Action submitted" : "Vote cast"}
                    </p>
                  </div>
                )}

                {currentPlayer.is_host && timeLeft === 0 && (
                  <Button
                    onClick={handlePhaseTransition}
                    className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    Next Phase
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Game Board */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm h-[600px]">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>
                    {gameRoom.status === "waiting"
                      ? "Waiting for players..."
                      : gameRoom.status === "finished"
                        ? `Game Over - ${gameRoom.winner} wins!`
                        : `${gameRoom.current_phase.charAt(0).toUpperCase() + gameRoom.current_phase.slice(1)} Phase - Day ${gameRoom.day_number}`}
                  </span>
                  <Badge
                    variant={
                      gameRoom.status === "waiting"
                        ? "secondary"
                        : gameRoom.status === "finished"
                          ? "destructive"
                          : "default"
                    }
                  >
                    {gameRoom.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full flex flex-col">
                {/* Game Status */}
                <div className="flex-1 flex items-center justify-center">
                  {gameRoom.status === "waiting" ? (
                    <div className="text-center">
                      <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                      <p className="text-slate-300 text-lg mb-2">Waiting for more players</p>
                      <p className="text-slate-500">Need at least 4 players to start</p>
                    </div>
                  ) : gameRoom.status === "finished" ? (
                    <div className="text-center">
                      <div className="w-32 h-32 bg-slate-700/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                        {gameRoom.winner === "mafia" ? (
                          <Skull className="w-16 h-16 text-red-400" />
                        ) : gameRoom.winner === "villagers" ? (
                          <Shield className="w-16 h-16 text-blue-400" />
                        ) : (
                          <Zap className="w-16 h-16 text-yellow-400" />
                        )}
                      </div>
                      <p className="text-white text-2xl mb-2">Game Over!</p>
                      <p className="text-slate-300 text-lg mb-4">
                        {gameRoom.winner === "mafia" && "The Mafia has taken control!"}
                        {gameRoom.winner === "villagers" && "The Villagers have prevailed!"}
                        {gameRoom.winner === "jester" && "The Jester achieved chaos!"}
                      </p>
                      <Button onClick={() => router.push("/")} className="bg-purple-600 hover:bg-purple-700 text-white">
                        Return to Lobby
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-32 h-32 bg-slate-700/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                        {gameRoom.current_phase === "night" ? (
                          <div className="text-6xl">🌙</div>
                        ) : (
                          <div className="text-6xl">☀️</div>
                        )}
                      </div>
                      <p className="text-white text-xl mb-2">
                        {gameRoom.current_phase === "night" ? "Night Time" : "Day Time"}
                      </p>
                      <p className="text-slate-300 mb-4">
                        {gameRoom.current_phase === "night"
                          ? "Special roles are active. Make your moves carefully."
                          : "Discuss and vote to eliminate a suspect."}
                      </p>

                      {currentPlayer.is_alive && gameRoom.status !== "finished" && (
                        <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600">
                          <p className="text-white font-medium mb-2">
                            Your Role: {currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)}
                          </p>
                          <p className="text-slate-300 text-sm">
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "mafia" &&
                              "Choose a player to eliminate"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "doctor" &&
                              "Choose a player to protect"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "detective" &&
                              "Choose a player to investigate"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "villager" &&
                              "Sleep tight, you have no night action"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "jester" &&
                              "Sleep tight, you have no night action"}
                            {gameRoom.current_phase === "day" &&
                              currentPlayer.role === "jester" &&
                              "Try to get yourself voted out to win!"}
                            {gameRoom.current_phase === "day" &&
                              currentPlayer.role !== "jester" &&
                              "Participate in the discussion and vote"}
                          </p>
                        </div>
                      )}

                      {!currentPlayer.is_alive && (
                        <div className="bg-red-900/30 p-4 rounded-lg border border-red-600">
                          <p className="text-red-200 font-medium mb-2">You are dead</p>
                          <p className="text-red-300 text-sm">You can still watch the game but cannot participate</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm h-[600px]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`p-2 rounded text-sm ${
                        message.message_type === "system"
                          ? "bg-blue-900/30 text-blue-200 italic"
                          : "bg-slate-700/30 text-slate-200"
                      }`}
                    >
                      {message.players && <span className="font-medium text-white">{message.players.username}: </span>}
                      {message.message}
                    </div>
                  ))}
                </div>

                {/* Message Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                    disabled={gameRoom.status === "waiting" || gameRoom.status === "finished"}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newMessage.trim() || gameRoom.status === "waiting" || gameRoom.status === "finished"}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
