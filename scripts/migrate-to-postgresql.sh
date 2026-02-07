#!/bin/bash

# Script to migrate from MySQL/SQLite to PostgreSQL
# This script will reset Prisma migrations and create new ones for PostgreSQL

set -e

echo "🔄 Starting migration to PostgreSQL..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Please create one based on .env.example"
    exit 1
fi

# Source environment variables
source .env

echo "📁 Backing up existing migrations..."
if [ -d "prisma/migrations" ]; then
    mv prisma/migrations prisma/migrations_backup_$(date +%Y%m%d_%H%M%S)
fi

echo "🗑️  Resetting Prisma migrations..."
rm -rf prisma/migrations

echo "🔧 Generating Prisma client for PostgreSQL..."
npx prisma generate

echo "📋 Creating initial migration for PostgreSQL..."
npx prisma migrate dev --name init

echo "🌱 Running database seed (optional)..."
read -p "Do you want to run the database seed? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run prisma:seed
fi

echo "✅ Migration to PostgreSQL completed successfully!"
echo "🔍 You can verify the database schema with: npx prisma studio"
