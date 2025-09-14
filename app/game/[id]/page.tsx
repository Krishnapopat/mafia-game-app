import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { GameRoom } from "@/components/game-room"

interface GamePageProps {
  params: Promise<{ id: string }>
}

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Check if user is in this game
  const { data: participant } = await supabase
    .from("game_participants")
    .select("*")
    .eq("game_id", id)
    .eq("player_id", user.id)
    .single()

  if (!participant) {
    redirect("/")
  }

  // Get game room data
  const { data: gameRoom } = await supabase.from("game_rooms").select("*").eq("id", id).single()

  if (!gameRoom) {
    redirect("/")
  }

  return <GameRoom gameId={id} />
}
