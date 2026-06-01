#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "============================================="
echo "   Setting up Video Call Project   "
echo "============================================="

# Check and install server dependencies
echo "[SETUP] Checking server dependencies..."
cd server
if [ ! -d "node_modules" ]; then
    echo "[SETUP] Installing server dependencies..."
    npm install
else
    echo "[SETUP] Server dependencies already installed. Skipping..."
fi
cd ..

# Check and install client dependencies
echo "[SETUP] Checking client dependencies..."
cd client
if [ ! -d "node_modules" ]; then
    echo "[SETUP] Installing client dependencies..."
    npm install
else
    echo "[SETUP] Client dependencies already installed. Skipping..."
fi
cd ..

echo "============================================="
echo "   Starting Services    "
echo "============================================="

# Ensure background processes are killed when the script exits
trap 'echo "[SYSTEM] Shutting down services..."; kill 0' SIGINT SIGTERM EXIT

# Start the Node.js server and prefix its output
# We use a while loop with read to avoid output buffering issues common with sed/awk
(cd server && npm run dev) 2>&1 | while IFS= read -r line; do
  # Blue prefix for server
  echo -e "\033[34m[SERVER]\033[0m $line"
done &

# Start the Next.js client and prefix its output
(cd client && npm run dev) 2>&1 | while IFS= read -r line; do
  # Green prefix for client
  echo -e "\033[32m[CLIENT]\033[0m $line"
done &

# Wait for background jobs to finish
wait
