import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('/placeholder-raawb.png')] opacity-5"></div>
      <div className="relative z-10 w-full max-w-sm">
        <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white">Welcome to the Family</CardTitle>
            <CardDescription className="text-slate-300">Check your email to confirm your account</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300 text-center">
              You've successfully signed up. Please check your email to confirm your account before you can join the
              game.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
