#!/bin/bash
set -e

echo "=== 1. Node.js setup ==="
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs build-essential
fi

echo "=== 2. Directory setup ==="
sudo mkdir -p /var/www/git-ranked-worker
sudo chown -R $USER:$USER /var/www/git-ranked-worker

echo "=== 3. Extracting code ==="
tar -xzf ~/worker-deploy.tar.gz -C /var/www/git-ranked-worker
cd /var/www/git-ranked-worker

echo "=== 4. Installing dependencies ==="
npm install

echo "=== 5. Writing environment configuration ==="
cat << 'EOF' > .env
DATABASE_URL="postgresql://neondb_owner:npg_UgsZz6X2wlFj@ep-square-hat-aubbiotz-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
OPENROUTER_API_KEY="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"
OPENROUTER_MODEL="tencent/hy3:free"
RATE_LIMIT_RPM="120"
CLASSIFY_TEAM_CONCURRENCY="2"
CLASSIFY_CANDIDATE_CONCURRENCY="6"
EOF

echo "=== 6. Installing systemd unit ==="
CURRENT_USER=$(whoami)
NPM_PATH=$(which npm)

sudo bash -c "cat <<EOF > /etc/systemd/system/git-ranked-worker.service
[Unit]
Description=GitRanked pg-boss Worker Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=/var/www/git-ranked-worker
ExecStart=${NPM_PATH} run worker
Restart=always
RestartSec=5
EnvironmentFile=/var/www/git-ranked-worker/.env

[Install]
WantedBy=multi-user.target
EOF"

echo "=== 7. Starting service ==="
sudo systemctl daemon-reload
sudo systemctl enable git-ranked-worker
sudo systemctl restart git-ranked-worker
sudo systemctl status git-ranked-worker --no-pager
