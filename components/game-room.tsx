"use client"

import { useState, useEffect } from "react"
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
  EyeOff,
  LogOut,
  AlertCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"

interface GameRoomProps {
  gameId: string
}

interface Player {
  id: number
  username: string
}

interface GameParticipant {
  id: number
  player_id: number
  role: string
  is_alive: boolean
  is_host: boolean
  last_healed_player_id?: number
  username: string
}

interface GameRoom {
  id: number
  room_code: string
  name: string
  status: string
  current_phase: string
  day_number: number
  max_players: number
  current_players: number
  host_id: number
  winner?: string
  role_config?: string
  doctor_can_heal_same_twice?: boolean
}

interface GameMessage {
  id: number
  message: string
  message_type: string
  created_at: string
  username?: string
}

const ROLE_ICONS = {
  villager: Users,
  mafia: Skull,
  doctor: Shield,
  detective: Search,
  fake_detective: EyeOff,
  jester: Zap,
  bandit: Zap,
}

const ROLE_COLORS = {
  villager: "bg-blue-600",
  mafia: "bg-red-600",
  doctor: "bg-green-600",
  detective: "bg-purple-600",
  fake_detective: "bg-orange-600",
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
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null)
  const [hasActed, setHasActed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomDeleted, setRoomDeleted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchGameData()
    const interval = setInterval(fetchGameData, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [gameId])

  const fetchGameData = async () => {
    try {
      const [roomRes, participantsRes, messagesRes] = await Promise.all([
        fetch(`/api/games/${gameId}`),
        fetch(`/api/games/${gameId}/participants`),
        fetch(`/api/games/${gameId}/messages`)
      ])

      if (roomRes.ok) {
        const room = await roomRes.json()
        setGameRoom(room)
      } else if (roomRes.status === 404) {
        // Room not found - might be deleted
        setRoomDeleted(true)
        return
      }

      if (participantsRes.ok) {
        const participantsData = await participantsRes.json()
        setParticipants(participantsData)
        
        // Find current player
        const savedPlayer = localStorage.getItem('mafia_player')
        if (savedPlayer) {
          const player = JSON.parse(savedPlayer)
          const currentParticipant = participantsData.find((p: GameParticipant) => p.player_id === player.id)
          setCurrentPlayer(currentParticipant || null)
        }
      }

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json()
        setMessages(messagesData)
        
        // Check for room deletion message
        const deletionMessage = messagesData.find((msg: GameMessage) => 
          msg.message.includes('has been deleted by the host')
        )
        if (deletionMessage) {
          setRoomDeleted(true)
        }
      }
    } catch (error) {
      console.error('Error fetching game data:', error)
    }
  }

  const handleStartGame = async () => {
    if (!currentPlayer?.is_host || !gameRoom) return

    try {
      const response = await fetch(`/api/games/${gameId}/start`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      fetchGameData()
    } catch (error: any) {
      setError(error.message)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !currentPlayer) return

    try {
      const response = await fetch(`/api/games/${gameId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newMessage.trim(),
          player_id: currentPlayer.player_id
        })
      })

      if (response.ok) {
        setNewMessage("")
        fetchGameData()
      }
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleNightAction = async () => {
    if (!currentPlayer || !selectedTarget || !gameRoom) return

    try {
      const response = await fetch(`/api/games/${gameId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: currentPlayer.role === 'mafia' ? 'kill' : 
                      currentPlayer.role === 'doctor' ? 'heal' : 'investigate',
          target_id: selectedTarget,
          player_id: currentPlayer.player_id
        })
      })

      if (response.ok) {
        setHasActed(true)
        fetchGameData()
      } else {
        const error = await response.json()
        setError(error.message)
      }
    } catch (error) {
      console.error('Error performing action:', error)
    }
  }

  const handleVote = async () => {
    if (!currentPlayer || !selectedTarget || !gameRoom) return

    try {
      const response = await fetch(`/api/games/${gameId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: selectedTarget,
          player_id: currentPlayer.player_id
        })
      })

      if (response.ok) {
        setHasActed(true)
        fetchGameData()
      }
    } catch (error) {
      console.error('Error voting:', error)
    }
  }

  const handleLeaveGame = async () => {
    if (!currentPlayer) return

    if (confirm('Are you sure you want to leave the game?')) {
      try {
        const response = await fetch('/api/participants', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: parseInt(gameId),
            player_id: currentPlayer.player_id
          })
        })

        if (response.ok) {
          router.push('/')
        }
      } catch (error) {
        console.error('Error leaving game:', error)
      }
    }
  }

  const getAvailableTargets = () => {
    if (!currentPlayer || !currentPlayer.is_alive) return []

    if (gameRoom?.current_phase === "night") {
      if (currentPlayer.role === "mafia") {
        return participants.filter((p) => p.is_alive && p.role !== "mafia" && p.player_id !== currentPlayer.player_id)
      } else if (currentPlayer.role === "doctor") {
        const canHealSameTwice = gameRoom.doctor_can_heal_same_twice
        if (canHealSameTwice) {
          return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
        } else {
          return participants.filter((p) => 
            p.is_alive && 
            p.player_id !== currentPlayer.player_id &&
            p.player_id !== currentPlayer.last_healed_player_id
          )
        }
      } else if (currentPlayer.role === "detective" || currentPlayer.role === "fake_detective") {
        return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
      }
    } else if (gameRoom?.current_phase === "day") {
      return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
    }

    return []
  }

  const availableTargets = getAvailableTargets()
  const canAct = currentPlayer?.is_alive && !hasActed && availableTargets.length > 0

  // Show room deleted message
  if (roomDeleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="absolute inset-0 bg-[url('/placeholder-raawb.png')] opacity-5"></div>
        <div className="relative z-10 text-center">
          <div className="w-32 h-32 bg-red-900/30 rounded-full flex items-center justify-center mb-6 mx-auto">
            <AlertCircle className="w-16 h-16 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Room Deleted</h1>
          <p className="text-slate-300 text-lg mb-6">
            The room has been deleted by the host.
          </p>
          <Button 
            onClick={() => router.push("/")} 
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Return to Lobby
          </Button>
        </div>
      </div>
    )
  }

  if (!gameRoom || !currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  // Don't show role badge in lobby phase
  const shouldShowRole = gameRoom.status !== "waiting" && gameRoom.current_phase !== "lobby"
  const displayRole = shouldShowRole ? currentPlayer.role : null

  const RoleIcon = displayRole ? ROLE_ICONS[displayRole as keyof typeof ROLE_ICONS] : Users
  const roleColor = displayRole ? ROLE_COLORS[displayRole as keyof typeof ROLE_COLORS] : "bg-gray-600"

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
              Back to Lobby
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">{gameRoom.name}</h1>
              <p className="text-slate-300">Room Code: {gameRoom.room_code}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {shouldShowRole && (
              <Badge className={`${roleColor} text-white`}>
                <RoleIcon className="w-4 h-4 mr-1" />
                {displayRole?.charAt(0).toUpperCase() + displayRole?.slice(1).replace('_', ' ')}
              </Badge>
            )}
            {!shouldShowRole && (
              <Badge className="bg-gray-600 text-white">
                <Users className="w-4 h-4 mr-1" />
                Waiting for Game Start
              </Badge>
            )}
            <Button
              onClick={handleLeaveGame}
              variant="outline"
              size="sm"
              className="border-red-600 text-red-400 hover:bg-red-900/30"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave Game
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

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
                    const participantRoleColor = ROLE_COLORS[participant.role as keyof typeof ROLE_COLORS] || "bg-gray-600"

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
                            {participant.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!participant.is_alive && <Skull className="w-4 h-4 text-red-400" />}
                          {shouldShowRole && (
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
                        {currentPlayer.role === "fake_detective" && "Investigate Target"}
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
                            Your Role: {currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1).replace('_', ' ')}
                          </p>
                          <p className="text-slate-300 text-sm">
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "mafia" &&
                              "Choose a player to eliminate (coordinate with other mafia members)"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "doctor" &&
                              (gameRoom.doctor_can_heal_same_twice 
                                ? "Choose a player to protect (no restrictions)"
                                : "Choose a player to protect (cannot heal same person twice in a row)"
                              )}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "detective" &&
                              "Choose a player to investigate (you will get immediate results)"}
                            {gameRoom.current_phase === "night" &&
                              currentPlayer.role === "fake_detective" &&
                              "Choose a player to investigate (your results may be incorrect)"}
                            {gameRoom.current_phase === "night" &&
                              (currentPlayer.role === "villager" || currentPlayer.role === "jester" || currentPlayer.role === "bandit") &&
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
                          : message.message_type === "vote"
                          ? "bg-yellow-900/30 text-yellow-200"
                          : message.message_type === "death"
                          ? "bg-red-900/30 text-red-200"
                          : "bg-slate-700/30 text-slate-200"
                      }`}
                    >
                      {message.username && <span className="font-medium text-white">{message.username}: </span>}
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
