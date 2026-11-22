# Deployment Guide

## Quick Start (Development)

```bash
git clone https://github.com/your-username/salon-suite.git
cd salon-suite
npm install
npm run dev
# Open http://localhost:4321
```

## Production Deployment

### 1. Server Requirements
- Ubuntu 22.04+ / Debian 12+
- Node.js 22+ (install via NodeSource or nvm)
- SQLite 3 (included in Node 22+)
- 512 MB RAM minimum, 1 GB recommended
- 2 GB disk space (DB + backups)

### 2. Install Node.js
```bash
# Via NodeSource (recommended)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # v22.x.x
npm --version
```

### 3. Clone & Install
```bash
sudo mkdir -p /opt/salon-suite
sudo chown $USER:$USER /opt/salon-suite
cd /opt/salon-suite
git clone https://github.com/your-username/salon-suite.git .
npm ci --omit=dev
```

### 4. Environment Configuration
```bash
cp .env.example .env
# Edit .env with production values
nano .env
```

Required production variables:
```env
PORT=4321
SESSION_SECRET=your-32-char-random-hex-string
SALON_NAME=Your Salon Name
SALON_TIMEZONE=Europe/London
WHATSAPP_TOKEN=EAAG...  # if using Cloud API
WHATSAPP_PHONE_ID=1234567890
WHATSAPP_VERIFY_TOKEN=your-random-string
SITE_URL=https://your-domain.com
```

Generate `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Systemd Service
```bash
sudo tee /etc/systemd/system/salon-suite.service > /dev/null <<'EOF'
[Unit]
Description=Salon Suite
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/salon-suite
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/salon-suite/data /opt/salon-suite/backups

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now salon-suite
```

### 6. Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/salon-suite /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 7. SSL (Let's Encrypt)
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 8. WhatsApp Webhook (Cloud API)
```bash
# In Meta Business Manager:
# Webhook URL: https://your-domain.com/api/webhooks/whatsapp
# Verify Token: same as WHATSAPP_VERIFY_TOKEN
# Subscribe to: messages
```

### 9. Backups
```bash
# Automated daily backup at 03:00
sudo tee /etc/cron.d/salon-suite-backup > /dev/null <<'EOF'
0 3 * * * www-data cd /opt/salon-suite && npm run backup >> /var/log/salon-backup.log 2>&1
EOF
```

Backups stored in `/opt/salon-suite/backups/` (keep 30 days).

### 10. Logs & Monitoring
```bash
# Service logs
sudo journalctl -u salon-suite -f

# Nginx access logs
tail -f /var/log/nginx/access.log

# Application logs (if using file output)
tail -f /opt/salon-suite/server.log
```

### 11. Updates
```bash
cd /opt/salon-suite
git pull
npm ci --omit=dev
sudo systemctl restart salon-suite
```

### 12. Firewall
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---

## Docker Alternative

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 4321
CMD ["node", "server/index.js"]
```

```bash
docker build -t salon-suite .
docker run -d -p 4321:4321 \
  -v salon-data:/app/data \
  -v salon-backups:/app/backups \
  --env-file .env \
  --name salon-suite \
  salon-suite
```

---

## Health Check
```bash
curl -f http://localhost:4321/health || exit 1
```

Returns:
```json
{
  "ok": true,
  "db": "/app/data/salon.db",
  "whatsapp": "api"
}
```