#!/bin/sh
set -e

# Fix ownership of data volume (may have been created by root)
chown -R node:node /data

# Run database migrations as node user
echo "Running database migrations..."
gosu node npx prisma@5.22.0 migrate deploy

# Seed if needed
echo "Seeding database..."
gosu node node prisma/seed.js

# Start application as non-root user
exec gosu node "$@"
