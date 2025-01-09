#!/bin/bash

echo "Deploying MusiXBot..."

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build the project
npm run build

# Restart the application
pm2 restart ecosystem.config.js --env production

echo "Deployment complete!"