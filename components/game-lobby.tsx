"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Users, Crown, Play, Plus, LogOut, Settings, Check, Shield, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface GameRoom {
  id: number
  room_code: string
  name: string
  current_players: number
  max_players: number
  status: string
  host_id: number
  role_config?: string
  doctor_can_heal_same_twice?: boolean
}

interface Player {
  id: number
  username: string
  games_played: number
  games_won: number
}

interface RoleConfig {
  mafia: number
  villager: number
  doctor: number
  detective: number
  fake_detective: number
  jester: number
  bandit: number
}

const DEFAULT_ROLE_CONFIGS: { [key: number]: RoleConfig } = {
  4: { mafia: 1, villager: 1, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 },
  5: { mafia: 1, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 },
  6: { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 0, bandit: 0 },
  7: { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 0, jester: 1, bandit: 0 },
  8: { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 0 },
  9: { mafia: 2, villager: 2, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 },
  10: { mafia: 2, villager: 3, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 },
  11: { mafia: 3, villager: 3, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 },
  12: { mafia: 3, villager: 4, doctor: 1, detective: 1, fake_detective: 1, jester: 1, bandit: 1 },
}

export function GameLobby() {
  const [gameRooms, setGameRooms] = useState<GameRoom[]>([])
  const [player, setPlayer] = useState<Player | null>(null)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [roomName, setRoomName] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [joinCode, setJoinCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [roleConfig, setRoleConfig] = useState<RoleConfig>(DEFAULT_ROLE_CONFIGS[8])
  const [doctorCanHealSameTwice, setDoctorCanHealSameTwice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState("")
  const [isUpdatingRoles, setIsUpdatingRoles] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if player is already set in localStorage
    const savedPlayer = localStorage.getItem('mafia_player')
    if (savedPlayer) {
      setPlayer(JSON.parse(savedPlayer))
    }
    fetchGameRooms()
  }, [])

  // Debounced role update to prevent flashing errors
  const updateRoleConfig = useCallback((newMaxPlayers: number) => {
    if (DEFAULT_ROLE_CONFIGS[newMaxPlayers]) {
      setIsUpdatingRoles(true)
      // Use setTimeout to ensure smooth transition
      setTimeout(() => {
        setRoleConfig(DEFAULT_ROLE_CONFIGS[newMaxPlayers])
        setIsUpdatingRoles(false)
      }, 50) // Small delay to prevent flash
    }
  }, [])

  // Handle max players change with debounce
  const handleMaxPlayersChange = (value: number) => {
    setMaxPlayers(value)
    updateRoleConfig(value)
  }

  const fetchGameRooms = async () => {
    try {
      const response = await fetch('/api/rooms')
      const rooms = await response.json()
      // Only show active games (not finished)
      const activeRooms = rooms.filter((room: GameRoom) => room.status !== 'finished')
      setGameRooms(activeRooms)
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  }

  const handleSetUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }
      
      const playerData = await response.json()
      setPlayer(playerData)
      localStorage.setItem('mafia_player', JSON.stringify(playerData))
    } catch (error: any) {
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!player) return

    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          host_id: player.id,
          max_players: maxPlayers,
          role_config: roleConfig,
          doctor_can_heal_same_twice: doctorCanHealSameTwice,
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      const roomData = await response.json()
      
      // Join the room as host
      await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_id: roomData.id,
          player_id: player.id,
          is_host: true,
        })
      })

      router.push(`/game/${roomData.id}`)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!player || !joinCode.trim()) return

    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: joinCode.toUpperCase(),
          player_id: player.id,
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      const roomData = await response.json()
      router.push(`/game/${roomData.id}`)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteRoom = async (roomId: number) => {
    if (!player) return
    
    const room = gameRooms.find(r => r.id === roomId)
    if (!room || room.host_id !== player.id) return
    
    if (!confirm(`Are you sure you want to delete "${room.name}"? This action cannot be undone.`)) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message)
      }

      // Refresh the rooms list
      fetchGameRooms()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = () => {
    localStorage.removeItem('mafia_player')
    setPlayer(null)
    setUsername("")
  }

  const updateRoleCount = (role: keyof RoleConfig, delta: number) => {
    setRoleConfig(prev => {
      const newConfig = { ...prev }
      newConfig[role] = Math.max(0, Math.min(newConfig[role] + delta, 5))
      return newConfig
    })
  }

  const getTotalRoles = () => {
    return Object.values(roleConfig).reduce((sum, count) => sum + count, 0)
  }

  const getRoleDescription = (role: keyof RoleConfig) => {
    const descriptions = {
      mafia: "Knows other Mafia members. Works together to eliminate villagers at night.",
      villager: "Ordinary players with no special power. Win by eliminating all Mafia.",
      doctor: "Each night, secretly chooses one player to save from elimination.",
      detective: "Each night, investigates one player. Gets truthful results.",
      fake_detective: "Each night, investigates one player. Gets random results.",
      jester: "Tries to get voted out during the day. If successful, Jester wins.",
      bandit: "Knows who the Mafia are and secretly works with them."
    }
    return descriptions[role]
  }

  const resetToDefault = () => {
    if (DEFAULT_ROLE_CONFIGS[maxPlayers]) {
      setIsUpdatingRoles(true)
      setTimeout(() => {
        setRoleConfig(DEFAULT_ROLE_CONFIGS[maxPlayers])
        setIsUpdatingRoles(false)
      }, 50)
    }
  }

  const isRoleConfigValid = () => {
    return getTotalRoles() === maxPlayers && !isUpdatingRoles
  }

  // If no player is set, show username form
  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-[url('/placeholder-raawb.png')] opacity-5"></div>
        <div className="relative z-10 w-full max-w-sm">
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-white">Welcome to Mafia</CardTitle>
              <p className="text-slate-300">Enter your username to start playing</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSetUsername}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="username" className="text-slate-200">
                      Username
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter your username"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      minLength={3}
                      maxLength={20}
                    />
                  </div>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    disabled={isLoading || !username.trim()}
                  >
                    {isLoading ? "Setting up..." : "Enter the Game"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Mafia Game</h1>
          <p className="text-slate-300">Welcome back, {player.username}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-slate-300">
            <p className="text-sm">Games Played: {player.games_played}</p>
            <p className="text-sm">Games Won: {player.games_won}</p>
          </div>
          <Button
            onClick={handleSignOut}
            variant="outline"
            size="sm"
            className="border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Room */}
        <div className="lg:col-span-1">
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Room
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showCreateRoom ? (
                <Button
                  onClick={() => setShowCreateRoom(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  Create New Game
                </Button>
              ) : (
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div>
                    <Label htmlFor="roomName" className="text-slate-200">
                      Room Name
                    </Label>
                    <Input
                      id="roomName"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Enter room name"
                      required
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxPlayers" className="text-slate-200">
                      Max Players
                    </Label>
                    <Input
                      id="maxPlayers"
                      type="number"
                      min="4"
                      max="12"
                      value={maxPlayers}
                      onChange={(e) => handleMaxPlayersChange(Number.parseInt(e.target.value))}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  
                  {error && (
                    <div className="p-3 bg-red-900/30 border border-red-600 rounded-lg">
                      <p className="text-red-200 text-sm">{error}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={isLoading || !isRoleConfigValid()}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isLoading ? "Creating..." : "Create"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowCreateRoom(false)}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </Button>
                  </div>
                  
                  {!isRoleConfigValid() && !isUpdatingRoles && (
                    <p className="text-red-400 text-sm text-center">
                      Role count ({getTotalRoles()}) must equal max players ({maxPlayers})
                    </p>
                  )}
                  
                  {isUpdatingRoles && (
                    <p className="text-blue-400 text-sm text-center">
                      Updating role configuration...
                    </p>
                  )}
                </form>
              )}
            </CardContent>
          </Card>

          {/* Doctor Restriction Toggle */}
          {showCreateRoom && (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Doctor Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-200 font-medium">Healing Restriction</p>
                      <p className="text-slate-400 text-sm">
                        {doctorCanHealSameTwice 
                          ? "Doctor can heal the same person multiple times"
                          : "Doctor cannot heal the same person twice in a row"
                        }
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setDoctorCanHealSameTwice(!doctorCanHealSameTwice)}
                      variant={doctorCanHealSameTwice ? "default" : "outline"}
                      size="sm"
                      className={doctorCanHealSameTwice 
                        ? "bg-green-600 hover:bg-green-700 text-white" 
                        : "border-slate-600 text-slate-300 hover:bg-slate-700"
                      }
                    >
                      {doctorCanHealSameTwice ? "ON" : "OFF"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Role Configuration */}
          {showCreateRoom && (
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mb-6">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Role Configuration
                  </div>
                  <Button
                    onClick={resetToDefault}
                    variant="outline"
                    size="sm"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    disabled={isUpdatingRoles}
                  >
                    Reset to Default
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(roleConfig).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200 capitalize">
                            {role.replace('_', ' ')}
                          </span>
                          <Badge variant="secondary" className="bg-slate-600 text-slate-200">
                            {count}
                          </Badge>
                        </div>
                        <p className="text-slate-400 text-xs mt-1">
                          {getRoleDescription(role as keyof RoleConfig)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateRoleCount(role as keyof RoleConfig, -1)}
                          disabled={count <= 0 || isUpdatingRoles}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700 w-8 h-8 p-0"
                        >
                          -
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateRoleCount(role as keyof RoleConfig, 1)}
                          disabled={count >= 5 || isUpdatingRoles}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700 w-8 h-8 p-0"
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 p-3 bg-slate-700/30 rounded-lg border border-slate-600">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">Total Roles:</span>
                    <span className={`font-medium ${isRoleConfigValid() ? 'text-green-400' : 'text-red-400'}`}>
                      {getTotalRoles()}/{maxPlayers}
                    </span>
                  </div>
                  {isRoleConfigValid() && (
                    <div className="flex items-center gap-1 mt-2 text-green-400 text-xs">
                      <Check className="w-3 h-3" />
                      <span>Configuration is valid</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Join by Code</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinByCode} className="space-y-4">
                <div>
                  <Label htmlFor="joinCode" className="text-slate-200">
                    Room Code
                  </Label>
                  <Input
                    id="joinCode"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 uppercase"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoading || !joinCode.trim()}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isLoading ? "Joining..." : "Join Game"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Available Rooms */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5" />
                Available Games
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gameRooms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 mb-4">No active games available</p>
                  <p className="text-slate-500 text-sm">Create a new room to start playing!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {gameRooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-medium">{room.name}</h3>
                          <Badge variant="secondary" className="bg-slate-600 text-slate-200">
                            {room.room_code}
                          </Badge>
                          {room.host_id === player.id && <Crown className="w-4 h-4 text-yellow-400" />}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {room.current_players}/{room.max_players}
                          </span>
                          <Badge
                            variant={room.status === "waiting" ? "default" : "secondary"}
                            className="bg-green-600 text-white"
                          >
                            {room.status}
                          </Badge>
                          {room.doctor_can_heal_same_twice !== undefined && (
                            <span className="text-xs">
                              Doctor: {room.doctor_can_heal_same_twice ? "No restriction" : "Restricted"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => router.push(`/game/${room.id}`)}
                          disabled={room.current_players >= room.max_players}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                          size="sm"
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Join
                        </Button>
                        {room.host_id === player.id && (
                          <Button
                            onClick={() => handleDeleteRoom(room.id)}
                            disabled={isLoading}
                            variant="outline"
                            size="sm"
                            className="border-red-600 text-red-400 hover:bg-red-900/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
