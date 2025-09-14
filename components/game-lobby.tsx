"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Users, Crown, Play, Plus, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

interface GameRoom {
  id: string
  room_code: string
  name: string
  current_players: number
  max_players: number
  status: string
  host_id: string
}

interface Player {
  id: string
  username: string
  games_played: number
  games_won: number
}

export function GameLobby() {
  const [gameRooms, setGameRooms] = useState<GameRoom[]>([])
  const [player, setPlayer] = useState<Player | null>(null)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [roomName, setRoomName] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [joinCode, setJoinCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const getPlayerAndRooms = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Get player profile
      const { data: playerData } = await supabase.from("players").select("*").eq("id", user.id).single()

      setPlayer(playerData)

      // Get available game rooms
      const { data: roomsData } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("status", "waiting")
        .order("created_at", { ascending: false })

      setGameRooms(roomsData || [])
    }

    getPlayerAndRooms()

    // Subscribe to room updates
    const roomsSubscription = supabase
      .channel("game_rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, () => {
        getPlayerAndRooms()
      })
      .subscribe()

    return () => {
      roomsSubscription.unsubscribe()
    }
  }, [])

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!player) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from("game_rooms")
        .insert({
          name: roomName,
          host_id: player.id,
          max_players: maxPlayers,
          current_players: 1,
        })
        .select()
        .single()

      if (error) throw error

      // Join the room as host
      await supabase.from("game_participants").insert({
        game_id: data.id,
        player_id: player.id,
        role: "villager", // Will be assigned properly when game starts
        is_host: true,
      })

      router.push(`/game/${data.id}`)
    } catch (error) {
      console.error("Error creating room:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinRoom = async (roomId: string) => {
    if (!player) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      await supabase.from("game_participants").insert({
        game_id: roomId,
        player_id: player.id,
        role: "villager", // Will be assigned properly when game starts
        is_host: false,
      })

      // Update room player count
      const room = gameRooms.find((r) => r.id === roomId)
      if (room) {
        await supabase
          .from("game_rooms")
          .update({ current_players: room.current_players + 1 })
          .eq("id", roomId)
      }

      router.push(`/game/${roomId}`)
    } catch (error) {
      console.error("Error joining room:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!player || !joinCode.trim()) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const { data: room } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("room_code", joinCode.toUpperCase())
        .eq("status", "waiting")
        .single()

      if (!room) {
        alert("Room not found or game already started")
        return
      }

      if (room.current_players >= room.max_players) {
        alert("Room is full")
        return
      }

      await handleJoinRoom(room.id)
    } catch (error) {
      console.error("Error joining by code:", error)
      alert("Error joining room")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  if (!player) return null

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
        {/* Create/Join Room */}
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
                      onChange={(e) => setMaxPlayers(Number.parseInt(e.target.value))}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      Create
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
                </form>
              )}
            </CardContent>
          </Card>

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
                  Join Game
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
                  <p className="text-slate-400 mb-4">No games available</p>
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
                        </div>
                      </div>
                      <Button
                        onClick={() => handleJoinRoom(room.id)}
                        disabled={isLoading || room.current_players >= room.max_players}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        size="sm"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Join
                      </Button>
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
