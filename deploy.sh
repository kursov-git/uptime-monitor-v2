#!/bin/bash
set -e

echo "🚀 Deploying Uptime Monitor..."

# Build the bundle (excluding unnecessary files)
echo "📦 Building bundle..."
tar -czf /tmp/uptime-monitor.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=deploy-tools \
  --exclude='*.tar.gz' \
  --exclude='.env' \
  .

# Upload to server
echo "📤 Uploading to server..."
scp /tmp/uptime-monitor.tar.gz uptime:/root/

# Deploy on server
echo "🔧 Deploying on server..."
ssh uptime 'bash -s' << 'REMOTE'
  set -e
  cd /root
  
  # Backup .env if it exists
  cp uptime-monitor/.env /root/.env.bak 2>/dev/null || true
  
  # Extract new code
  rm -rf uptime-monitor
  mkdir -p uptime-monitor
  cd uptime-monitor
  tar -xzf /root/uptime-monitor.tar.gz
  
  # Restore .env
  cp /root/.env.bak .env 2>/dev/null || true
  
  # Ensure permissions
  chmod +x server/docker-entrypoint.sh
  
  # Stop old containers (avoids stale image conflicts)
  docker stop $(docker ps -aq) 2>/dev/null || true
  docker rm $(docker ps -aq) 2>/dev/null || true
  docker network prune -f 2>/dev/null || true
  
  # Build and start
  docker-compose up -d --build
  
  echo "✅ Deployment complete!"
REMOTE

# Cleanup local bundle
rm /tmp/uptime-monitor.tar.gz

echo ""
echo "✅ Done! App is live at http://$(ssh uptime 'hostname -I | awk "{print \$1}"')"
