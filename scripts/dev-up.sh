#!/bin/bash
# Start local development database

set -e

echo "Starting local Postgres database..."
docker compose up -d

echo ""
echo "Waiting for database to be ready..."
sleep 3

# Check if database is healthy
if docker compose ps postgres | grep -q "healthy"; then
  echo "✓ Database is ready!"
else
  echo "⚠ Database may still be starting. Check with: docker compose ps"
fi

echo ""
echo "Connection info:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  User: local"
echo "  Password: local"
echo "  Database: month_end_checker"
echo ""
echo "Connection string:"
echo "  postgres://local:local@localhost:5432/month_end_checker"
echo ""
echo "To stop: docker compose down"
echo "To view logs: docker compose logs -f postgres"

