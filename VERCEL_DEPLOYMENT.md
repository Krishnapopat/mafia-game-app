# 🚀 Deploy to Vercel with Neon Database

## ✅ Fixed: DATABASE_URL Error Resolved!

The app now properly detects and uses your Neon database when `DATABASE_URL` is set.

## 🎯 Step-by-Step Deployment

### 1. **Set up your Neon Database**

1. Go to your Neon dashboard
2. Copy your connection string (it looks like):
   ```
   postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

### 2. **Set up Database Tables**

Run this command to create the required tables:
```bash
psql "your-neon-connection-string" -f setup-database.sql
```

### 3. **Deploy to Vercel**

#### Option A: Via Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

#### Option B: Via Vercel Dashboard (GUI)
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. **Add Environment Variable:**
   - Name: `DATABASE_URL`
   - Value: Your Neon connection string
5. Click "Deploy"

### 4. **Test Your Deployment**

1. Visit your Vercel URL
2. Create a room
3. Share the room code with friends
4. Start playing!

## 🔧 How It Works Now

- **Local Development**: Uses file-based database (no setup needed)
- **Vercel with DATABASE_URL**: Uses your Neon PostgreSQL database
- **Vercel without DATABASE_URL**: Uses in-memory database (fallback)

## �� Features Ready

- ✅ Real-time multiplayer gameplay
- ✅ Room management (create, join, delete)
- ✅ All game roles and mechanics
- ✅ Live chat system
- ✅ Host controls
- ✅ Mobile responsive design

## 🆘 Troubleshooting

**If you still get DATABASE_URL errors:**
1. Make sure the environment variable is set in Vercel dashboard
2. Check that your Neon connection string is correct
3. Ensure you've run the database setup script

**If the app doesn't work:**
1. Check Vercel function logs
2. Verify your database connection
3. Make sure all tables are created

## 🎉 You're Ready!

Your Mafia game is now ready to play with friends online! 🎮
