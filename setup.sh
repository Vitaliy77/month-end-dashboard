#!/bin/bash
# Setup script for Month-End Dashboard

echo "Setting up Month-End Dashboard..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 20.x"
    exit 1
fi

# Check if PostgreSQL is available
if ! command -v psql &> /dev/null; then
    echo "Warning: PostgreSQL command line tools not found. Database setup may require manual configuration."
fi

# Setup API
echo "Setting up API..."
cd api
if [ ! -d "node_modules" ]; then
    echo "Installing API dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "Creating API .env file from .env.example..."
    cp .env.example .env
    echo "Please edit api/.env with your configuration"
fi

cd ..

# Setup Web
echo "Setting up Web..."
cd web
if [ ! -d "node_modules" ]; then
    echo "Installing Web dependencies..."
    npm install
fi

if [ ! -f ".env.local" ]; then
    echo "Creating Web .env.local file from .env.example..."
    cp .env.example .env.local
fi

cd ..

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure api/.env with your database and QuickBooks credentials"
echo "2. Create PostgreSQL database: createdb month_end_dashboard"
echo "3. Start API: cd api && npm run dev"
echo "4. Start Web: cd web && npm run dev"
echo "5. Access application at http://localhost:3001"
