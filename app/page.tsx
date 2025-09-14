import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { GameLobby } from "@/components/game-lobby"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Check if user has a player profile
  const { data: player } = await supabase.from("players").select("*").eq("id", user.id).single()

  if (!player) {
    redirect("/auth/setup-profile")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('/placeholder-raawb.png')] opacity-5"></div>
      <div className="relative z-10">
        <GameLobby />
      </div>
    </div>
  )
}
