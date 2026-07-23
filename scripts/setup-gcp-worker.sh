#!/bin/bash
set -e

echo "=== GitRanked Worker Setup on GCP ==="

# Update package lists and install Node.js 20 & build tools
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential

# Prepare application directory
sudo mkdir -p /var/www/git-ranked-worker
sudo chown -R $USER:$USER /var/www/git-ranked-worker

echo "=== Node.js version ==="
node -v
npm -v
