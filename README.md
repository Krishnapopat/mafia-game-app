# Mafia Game

A real-time multiplayer Mafia game built with Next.js, TypeScript, and PostgreSQL.

## Features

- 🎮 **Real-time multiplayer gameplay**
- 🎭 **Multiple roles**: Mafia, Villager, Doctor, Detective, Fake Detective, Jester, Bandit
- 🏠 **Room-based system** with join codes
- 💬 **Live chat** during games
- ⚙️ **Customizable role configurations**
- 🎯 **Host controls** (start game, delete room)
- 📱 **Responsive design**

## Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up PostgreSQL database:**
   - Create a PostgreSQL database
   - Run the SQL scripts in the `scripts/` directory to set up tables

3. **Set environment variables:**
   ```bash
   export DATABASE_URL="postgresql://username:password@localhost:5432/mafia_game"
   ```

4. **Run the development server:**
   ```bash
   pnpm dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)**

## Deployment to Vercel

### Prerequisites
- Vercel account
- PostgreSQL database (recommended: [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app))

### Steps

1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add environment variable: `DATABASE_URL` with your PostgreSQL connection string
   - Deploy!

3. **Set up your database:**
   - Connect to your production database
   - Run the SQL scripts from the `scripts/` directory

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string

## Game Rules

### Roles
- **Mafia**: Knows other Mafia members. Eliminates villagers at night.
- **Villager**: Ordinary players with no special powers.
- **Doctor**: Saves one player from elimination each night.
- **Detective**: Investigates players and gets truthful results.
- **Fake Detective**: Investigates players but gets random results.
- **Jester**: Tries to get voted out to win the game.
- **Bandit**: Knows who the Mafia are and works with them.

### Win Conditions
- **Mafia wins**: When Mafia members equal or outnumber villagers
- **Villagers win**: When all Mafia members are eliminated
- **Jester wins**: When the Jester gets voted out during the day

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Deployment**: Vercel
- **UI Components**: Radix UI, Lucide React

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
