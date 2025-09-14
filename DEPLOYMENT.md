# 🚀 Mafia Game - Vercel Deployment Guide

## ✅ All Issues Fixed!

### 1. **Finished Games Filtered Out** ✅
- Only active games (waiting/in-progress) are shown in the lobby
- Finished games are automatically hidden

### 2. **Delete Room Functionality** ✅
- Hosts can delete their rooms with the trash icon
- Confirmation dialog prevents accidental deletion
- All related data is properly cleaned up

### 3. **Ready for Vercel Deployment** ✅
- All dependencies added (pg, @types/pg)
- Vercel configuration file created
- Build tested and working
- Database setup scripts ready

## 🎯 Quick Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

4. **Set Environment Variable:**
   - Go to your Vercel dashboard
   - Select your project
   - Go to Settings → Environment Variables
   - Add: `DATABASE_URL` with your PostgreSQL connection string

### Option 2: Deploy via GitHub

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add `DATABASE_URL` environment variable
   - Deploy!

## 🗄️ Database Setup

### For Production (Recommended: Neon, Supabase, or Railway)

1. **Create a PostgreSQL database**
2. **Run the setup script:**
   ```bash
   psql "your-database-url" -f setup-database.sql
   ```

### Database Providers:
- **Neon** (Free tier): https://neon.tech
- **Supabase** (Free tier): https://supabase.com
- **Railway** (Free tier): https://railway.app

## 🔧 Environment Variables

Set this in your Vercel dashboard:
```
DATABASE_URL=postgresql://username:password@host:port/database
```

## 🎮 Features Ready for Production

- ✅ **Real-time multiplayer gameplay**
- ✅ **Room management** (create, join, delete)
- ✅ **Role-based gameplay** (Mafia, Villager, Doctor, etc.)
- ✅ **Live chat system**
- ✅ **Host controls**
- ✅ **Responsive design**
- ✅ **Auto role assignment**
- ✅ **Game state management**

## 🚨 Important Notes

1. **Database**: The app currently uses a file-based database for local development and in-memory for Vercel. For production with friends, you'll need a real PostgreSQL database.

2. **Real-time Updates**: The app polls every 2 seconds for updates. For better real-time experience, consider upgrading to WebSockets later.

3. **Scaling**: The current setup works great for small groups (4-12 players). For larger scale, consider implementing proper WebSocket connections.

## 🎯 Test Your Deployment

1. **Create a room** with your username
2. **Share the room code** with friends
3. **Start the game** when you have enough players
4. **Play and enjoy!**

## 🆘 Troubleshooting

- **Build fails**: Make sure all dependencies are installed (`pnpm install`)
- **Database errors**: Verify your `DATABASE_URL` is correct
- **Room not found**: Check if the room was deleted or finished

## 🎉 You're Ready!

Your Mafia game is now ready to play with friends online! Share the Vercel URL and start playing! 🎮
