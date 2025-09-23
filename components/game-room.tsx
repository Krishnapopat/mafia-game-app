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
  visible_to_player_id?: number
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
        
        // Filter messages based on visibility
        const savedPlayer = localStorage.getItem('mafia_player')
        if (savedPlayer) {
          const player = JSON.parse(savedPlayer)
          const filteredMessages = messagesData.filter((msg: GameMessage) => 
            !msg.visible_to_player_id || msg.visible_to_player_id === player.id
          )
          setMessages(filteredMessages)
        } else {
          setMessages(messagesData)
        }
        
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
          action_type: getActionType(),
          target_id: selectedTarget,
          player_id: currentPlayer.player_id
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      setHasActed(true)
      setSelectedTarget(null)
      fetchGameData()
    } catch (error: any) {
      setError(error.message)
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

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      setHasActed(true)
      setSelectedTarget(null)
      fetchGameData()
    } catch (error: any) {
      setError(error.message)
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
        const isRestricted = gameRoom.doctor_can_heal_same_twice
        if (isRestricted) {
          // When restricted (toggle ON), cannot heal same person twice
          return participants.filter((p) => 
            p.is_alive && 
            p.player_id !== currentPlayer.player_id && 
            p.player_id !== currentPlayer.last_healed_player_id
          )
        } else {
          // When not restricted (toggle OFF), can heal anyone
          return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
        }
      } else if (currentPlayer.role === "detective" || currentPlayer.role === "fake_detective") {
        return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
      }
    } else if (gameRoom?.current_phase === "day") {
      return participants.filter((p) => p.is_alive && p.player_id !== currentPlayer.player_id)
    }

    return []
  }

  const getActionType = () => {
    if (!currentPlayer) return ""
    
    switch (currentPlayer.role) {
      case "mafia":
        return "kill"
      case "doctor":
        return "heal"
      case "detective":
      case "fake_detective":
        return "investigate"
      default:
        return ""
    }
  }

  const canAct = () => {
    if (!currentPlayer || !currentPlayer.is_alive || hasActed) return false
    
    if (gameRoom?.current_phase === "night") {
      return ["mafia", "doctor", "detective", "fake_detective"].includes(currentPlayer.role)
    } else if (gameRoom?.current_phase === "day") {
      return true
    }
    
    return false
  }

  const availableTargets = getAvailableTargets()

  if (roomDeleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Room Deleted</h2>
            <p className="text-slate-300 mb-4">This room has been deleted by the host.</p>
            <Button onClick={() => router.push('/')} className="bg-red-600 hover:bg-red-700 text-white">
              Return to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!gameRoom || !currentPlayer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  // Don't show role badge in lobby phase
  const shouldShowRole = gameRoom.status !== "waiting" && gameRoom.current_phase !== "lobby"
  const displayRole = shouldShowRole ? currentPlayer.role : null

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

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Game Status */}
        {gameRoom.status === "finished" && (
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-6">
            <CardContent className="p-6 text-center">
              <h2 className="text-3xl font-bold text-white mb-2">Game Over!</h2>
              <p className="text-2xl text-green-400">{gameRoom.winner || 'Unknown'} wins!</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Game Info */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Players ({participants.length}/{gameRoom.max_players})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {participants.map((participant) => {
                    return (
                      <div
                        key={participant.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          participant.is_alive ? "bg-slate-700/30" : "bg-red-900/20"
                        } border border-slate-600 ${
                          selectedTarget === participant.player_id ? "ring-2 ring-red-500" : ""
                        } ${
                          canAct() && availableTargets.some((t) => t.player_id === participant.player_id)
                            ? "cursor-pointer hover:bg-slate-600/30"
                            : ""
                        }`}
                        onClick={() => {
                          if (canAct() && availableTargets.some((t) => t.player_id === participant.player_id)) {
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
                          {selectedTarget === participant.player_id && canAct() && (
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

                {canAct() && selectedTarget && (
                  <div className="mt-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <p className="text-slate-300 mb-2">
                      {gameRoom.current_phase === "night" 
                        ? `You will ${getActionType()} ${participants.find(p => p.player_id === selectedTarget)?.username}`
                        : `You will vote to eliminate ${participants.find(p => p.player_id === selectedTarget)?.username}`
                      }
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={gameRoom.current_phase === "night" ? handleNightAction : handleVote}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {gameRoom.current_phase === "night" ? "Confirm Action" : "Vote"}
                      </Button>
                      <Button
                        onClick={() => setSelectedTarget(null)}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {hasActed && (
                  <div className="mt-4 p-3 bg-green-900/30 border border-green-600 rounded-lg">
                    <p className="text-green-200 text-center">You have completed your action for this phase.</p>
                  </div>
                )}
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
                          : message.message_type === "private"
                          ? "bg-purple-900/30 text-purple-200 italic"
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
