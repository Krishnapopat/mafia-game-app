#!/bin/bash

echo "🚀 Preparing Mafia Game for Vercel Deployment..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit: Mafia Game ready for deployment"
fi

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📥 Installing Vercel CLI..."
    npm install -g vercel
fi

echo "🔧 Building the project..."
pnpm build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🌐 Ready to deploy to Vercel!"
    echo ""
    echo "Next steps:"
    echo "1. Run: vercel login"
    echo "2. Run: vercel"
    echo "3. Set DATABASE_URL environment variable in Vercel dashboard"
    echo "4. Set up your PostgreSQL database and run the SQL scripts"
    echo ""
    echo "Or deploy via GitHub:"
    echo "1. Push to GitHub: git push origin main"
    echo "2. Connect repository at vercel.com"
    echo "3. Add DATABASE_URL environment variable"
    echo "4. Deploy!"
else
    echo "❌ Build failed. Please fix errors before deploying."
    exit 1
fi
