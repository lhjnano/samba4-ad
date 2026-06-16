# Deployment & CI/CD

> Ubuntu 22.04 VM-based Samba 4 AD DC + FastAPI + React deployment process.
> All deployments must be **reproducible and rollbackable**.

---

## 1. Infrastructure

### 1.1 Server Topology

```
┌─────────────────────────────────────────────────┐
│                  Ubuntu 22.04 VM                  │
│                                                   │
│  ┌──────────────┐    ┌──────────────────────┐    │
│  │  nginx :443  │───▶│  FastAPI :8000       │    │
│  │  (TLS/HTTPS) │    │  (gunicorn/uvicorn)  │    │
│  └──────┬───────┘    └──────────┬───────────┘    │
│         │                       │                 │
│         │    ┌──────────────────▼────────────┐   │
│         │    │  Samba 4 AD DC (samba-ad-dc)  │   │
│         │    │  LDAP :636 (LDAPS)            │   │
│         │    │  Kerberos :88                 │   │
│         │    │  DNS :53                      │   │
│         │    │  SMB :445                     │   │
│         │    └───────────────────────────────┘   │
│         │                                          │
│  ┌──────▼───────┐                                 │
│  │ React static │  (nginx serves /var/www/samba4-ad/) │
│  │ file serving │                                 │
│  └──────────────┘                                 │
└─────────────────────────────────────────────────┘
```

### 1.2 System Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB | 100 GB (SSD) |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Network | Static IP, internal network | Static IP, internal network |

### 1.3 Domain Configuration

```
example.lan                    # AD domain (FQDN)
dc01.example.lan               # Domain controller hostname
admin.example.lan              # Admin UI (nginx)
api.example.lan  (optional)    # API-only subdomain
```

---

## 2. Samba 4 AD DC Provisioning

### 2.1 Initial Provisioning

```bash
# 1. System package update
sudo apt update && sudo apt upgrade -y

# 2. Set hostname
sudo hostnamectl set-hostname dc01
echo "192.168.1.10 dc01.example.lan dc01" | sudo tee -a /etc/hosts

# 3. Install Samba and tools
sudo apt install -y samba smbclient winbind ldb-tools \
  krb5-user krb5-config dnsutils ldap-utils

# 4. Backup and remove existing config
sudo mv /etc/samba/smb.conf /etc/samba/smb.conf.bak

# 5. Provision AD DC
sudo samba-tool domain provision \
  --use-rfc2307 \
  --interactive

# Prompt inputs:
#   Realm: EXAMPLE.LAN
#   Domain: EXAMPLE
#   Server Role: dc
#   DNS backend: SAMBA_INTERNAL
#   Administrator password: <strong-password>

# 6. Configure Kerberos
sudo cp /var/lib/samba/private/krb5.conf /etc/krb5.conf

# 7. Disable systemd-resolved (Samba handles DNS)
sudo systemctl disable systemd-resolved
sudo systemctl stop systemd-resolved

# 8. Start Samba AD DC service
sudo systemctl stop smbd nmbd winbind 2>/dev/null
sudo systemctl disable smbd nmbd winbind 2>/dev/null
sudo systemctl unmask samba-ad-dc
sudo systemctl start samba-ad-dc
sudo systemctl enable samba-ad-dc

# 9. Verify
sudo samba-tool domain info 127.0.0.1
host -t SRV _ldap._tcp.example.lan
kinit administrator@EXAMPLE.LAN
klist
```

### 2.2 Create Service Account (for FastAPI)

```bash
# Create LDAP binding service account
sudo samba-tool user create svc-ldap \
  --given-name="LDAP" \
  --surname="Service" \
  --userou="OU=Service Accounts,DC=example,DC=lan"

# Set password to never expire
sudo samba-tool user setexpiry svc-ldap --noexpiry
```

---

## 3. FastAPI Backend Deployment

### 3.1 System User and Directories

```bash
# Create dedicated service user
sudo useradd -r -s /bin/false -d /opt/samba4-ad samba4-ad

# Directory structure
sudo mkdir -p /opt/samba4-ad/backend
sudo mkdir -p /opt/samba4-ad/frontend
sudo mkdir -p /etc/samba4-ad
sudo mkdir -p /var/log/samba4-ad

# Ownership
sudo chown -R samba4-ad:samba4-ad /opt/samba4-ad /var/log/samba4-ad
```

### 3.2 Python Environment

```bash
# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Create virtual environment
sudo -u samba4-ad python3.11 -m venv /opt/samba4-ad/backend/.venv

# Install dependencies
cd /opt/samba4-ad/backend
sudo -u samba4-ad .venv/bin/pip install --upgrade pip
sudo -u samba4-ad .venv/bin/pip install fastapi uvicorn[standard] \
  ldap3 pydantic python-jose passlib[bcrypt] python-multipart
```

### 3.3 Environment File

```bash
# /etc/samba4-ad/backend.env
sudo nano /etc/samba4-ad/backend.env
```

```ini
# LDAP settings
LDAP_URL=ldaps://127.0.0.1:636
LDAP_BIND_DN=CN=svc-ldap,OU=Service Accounts,DC=example,DC=lan
LDAP_PASSWORD=<service-account-password>
LDAP_BASE_DN=DC=example,DC=lan

# Security
JWT_SECRET=<random-64-char-hex>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# Application
APP_NAME=Samba 4 AD Manager
APP_ENV=production
APP_DEBUG=false
CORS_ORIGINS=https://admin.example.lan
```

```bash
# Set permissions
sudo chmod 600 /etc/samba4-ad/backend.env
sudo chown samba4-ad:samba4-ad /etc/samba4-ad/backend.env
```

### 3.4 systemd Service

```ini
# /etc/systemd/system/samba4-ad-backend.service
[Unit]
Description=Samba 4 AD Manager - Backend (FastAPI)
After=network.target samba-ad-dc.service
Wants=samba-ad-dc.service

[Service]
Type=notify
User=samba4-ad
Group=samba4-ad
WorkingDirectory=/opt/samba4-ad/backend
EnvironmentFile=/etc/samba4-ad/backend.env
ExecStart=/opt/samba4-ad/backend/.venv/bin/gunicorn \
  src.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --bind 127.0.0.1:8000 \
  --timeout 30 \
  --keep-alive 5 \
  --access-logfile /var/log/samba4-ad/backend-access.log \
  --error-logfile /var/log/samba4-ad/backend-error.log
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
# Register and start service
sudo systemctl daemon-reload
sudo systemctl enable samba4-ad-backend
sudo systemctl start samba4-ad-backend
sudo systemctl status samba4-ad-backend
```

---

## 4. React Frontend Deployment

### 4.1 Build

```bash
# Build locally or in CI
cd frontend
npm ci
npm run build
# dist/ directory is generated
```

### 4.2 Deploy

```bash
# Copy build output to server
sudo rsync -avz --delete frontend/dist/ \
  /var/www/samba4-ad/

# Set permissions
sudo chown -R www-data:www-data /var/www/samba4-ad
```

---

## 5. nginx Reverse Proxy

### 5.1 Install and Configure nginx

```bash
sudo apt install -y nginx
```

```nginx
# /etc/nginx/sites-available/samba4-ad
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    listen 80;
    server_name admin.example.lan;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.example.lan;

    # TLS (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/admin.example.lan/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.lan/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.example.lan;" always;

    # React static files
    root /var/www/samba4-ad;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Rate limiting
        limit_req zone=api burst=20 nodelay;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health check (no rate limit)
    location /health {
        proxy_pass http://127.0.0.1:8000;
        access_log off;
    }

    # Static asset caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/samba4-ad /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 5.2 Let's Encrypt TLS Certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d admin.example.lan \
  --non-interactive --agree-tos --email admin@example.lan

# Verify auto-renewal
sudo systemctl status certbot.timer
```

---

## 6. CI/CD Pipeline (GitHub Actions)

### 6.1 Pipeline Flow

```
PR created/updated
  ├── lint (ruff check + eslint)
  ├── typecheck (mypy + tsc)
  ├── test:unit (pytest + vitest)
  ├── audit (pip-audit + npm audit)
  └── build (frontend npm run build)

PR merged → main
  ├── above all +
  └── deploy:staging (SSH deploy — Maintainer approval)

Tag created (v*.*.*) → Production deploy
  ├── above all +
  ├── AD backup auto-run
  ├── deploy:production (SSH deploy — Tech Lead approval)
  └── smoke:test:production
```

### 6.2 Deploy Script

```bash
# scripts/deploy.sh
#!/usr/bin/env bash
set -euo pipefail

ENV="${1:?Usage: deploy.sh <staging|production>}"
HOST="${2:?Host required}"
TAG="${3:?Git tag/version required}"

echo "🚀 Deploying samba4-ad v${TAG} to ${ENV}"

# 1. Backup (production only)
if [ "$ENV" = "production" ]; then
  echo "📦 Backing up AD..."
  ssh deploy@$HOST "sudo samba-tool domain backup online --targetdir=/backup/ --server=127.0.0.1"
fi

# 2. Deploy backend
echo "🔧 Deploying backend..."
scp -r backend/ deploy@$HOST:/tmp/samba4-ad-backend-${TAG}/
ssh deploy@$HOST << 'EOF'
  cd /opt/samba4-ad/backend
  source .venv/bin/activate
  pip install --upgrade pip
  pip install -r /tmp/samba4-ad-backend-*/requirements.txt
  sudo systemctl restart samba4-ad-backend
EOF

# 3. Deploy frontend
echo "🎨 Deploying frontend..."
scp -r frontend/dist/ deploy@$HOST:/tmp/samba4-ad-frontend-${TAG}/
ssh deploy@$HOST << 'EOF'
  sudo rsync -avz --delete /tmp/samba4-ad-frontend-*/ /var/www/samba4-ad/
  sudo chown -R www-data:www-data /var/www/samba4-ad/
EOF

# 4. Health check
echo "❤️ Health check..."
sleep 5
curl -sf "https://${HOST}/health" || { echo "❌ Health check failed!"; exit 1; }

echo "✅ Deployed samba4-ad v${TAG} to ${ENV}"
```

---

## 7. Manual Deployment Procedure

### 7.1 Production Deployment Checklist

**Before deployment (Deployer: Tech Lead):**
- [ ] All CI checks passed
- [ ] CHANGELOG.md reviewed (breaking changes?)
- [ ] Smoke test passed on staging
- [ ] AD backup created
- [ ] All related issues/PRs merged
- [ ] Deployment announced ("🚀 Deploying: v1.2.3")

**Deploy:**
```bash
# Run deploy script
bash scripts/deploy.sh production dc01.example.lan v1.2.3
```

**After deployment:**
- [ ] Health check passed (`/health` endpoint)
- [ ] Core functions manually verified (login, user search, group lookup, OU tree)
- [ ] nginx error logs checked (5-minute wait)
- [ ] Backend error logs checked
- [ ] Deployment completion announced ("✅ Deployed: v1.2.3")

### 7.2 Deployment Windows
- **Scheduled deploy**: Tuesday/Thursday 10:00–14:00 KST (low-traffic window)
- **Emergency deploy**: Anytime (Hotfix process)

---

## 8. Rollback

### 8.1 Backend Rollback
```bash
# Revert to previous version
ssh deploy@dc01.example.lan << 'EOF'
  cd /opt/samba4-ad/backend
  git checkout v1.2.2  # or previous tag
  source .venv/bin/activate
  pip install -r requirements.txt
  sudo systemctl restart samba4-ad-backend
EOF
```

### 8.2 Frontend Rollback
```bash
# Restore previous build (must keep previous builds)
ssh deploy@dc01.example.lan << 'EOF'
  sudo rsync -avz --delete /backup/samba4-ad-frontend-v1.2.2/ /var/www/samba4-ad/
  sudo chown -R www-data:www-data /var/www/samba4-ad/
EOF
```

### 8.3 AD Database Rollback
```bash
# Restore AD from backup (see INCIDENT-RESPONSE.md)
sudo systemctl stop samba-ad-dc
sudo samba-tool domain backup restore \
  --backup-file=/backup/samba-full-YYYYMMDD.tar.gz \
  --targetdir=/var/lib/samba
sudo systemctl start samba-ad-dc
```

### 8.4 Rollback Decision Criteria
| Situation | Immediate Rollback? |
|-----------|-------------------|
| Login not working | ✅ Immediately |
| LDAP bind failure | ✅ Immediately |
| API 5xx > 5% | ✅ Immediately |
| Minor bug | ❌ Wait for hotfix |
| Performance degradation (2x response) | ⚠️ Monitor then decide |

---

## 9. Firewall Configuration

```bash
# UFW rules
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (non-standard port recommended)
sudo ufw allow 2222/tcp  # or 22/tcp

# Samba AD DC
sudo ufw allow 53/tcp    # DNS
sudo ufw allow 53/udp    # DNS
sudo ufw allow 88/tcp    # Kerberos
sudo ufw allow 88/udp    # Kerberos
sudo ufw allow 135/tcp   # RPC
sudo ufw allow 139/tcp   # NetBIOS
sudo ufw allow 389/tcp   # LDAP
sudo ufw allow 389/udp   # LDAP
sudo ufw allow 445/tcp   # SMB
sudo ufw allow 464/tcp   # Kerberos kpasswd
sudo ufw allow 464/udp   # Kerberos kpasswd
sudo ufw allow 636/tcp   # LDAPS
sudo ufw allow 3268/tcp  # Global Catalog
sudo ufw allow 3269/tcp  # Global Catalog SSL

# nginx
sudo ufw allow 80/tcp    # HTTP (Let's Encrypt renewal)
sudo ufw allow 443/tcp   # HTTPS

# Enable
sudo ufw enable
sudo ufw status verbose
```

---

## 10. Monitoring

### 10.1 Health Check (cron)

```bash
# /opt/samba4-ad/scripts/health-monitor.sh
#!/usr/bin/env bash
ALERT_EMAIL="admin@example.lan"

# FastAPI health check
if ! curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
  echo "ALERT: FastAPI backend is down" | mail -s "SEV-1: Backend Down" $ALERT_EMAIL
  sudo systemctl restart samba4-ad-backend
fi

# Samba AD DC health check
if ! systemctl is-active --quiet samba-ad-dc; then
  echo "ALERT: Samba AD DC is down" | mail -s "SEV-1: AD DC Down" $ALERT_EMAIL
  sudo systemctl restart samba-ad-dc
fi

# Disk usage
USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$USAGE" -gt 85 ]; then
  echo "WARNING: Disk usage is ${USAGE}%" | mail -s "Disk Warning" $ALERT_EMAIL
fi
```

```bash
# Register in cron
sudo crontab -e
# Health check every 5 minutes
*/5 * * * * /opt/samba4-ad/scripts/health-monitor.sh
```

### 10.2 Log Rotation

```bash
# /etc/logrotate.d/samba4-ad
/var/log/samba4-ad/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 samba4-ad samba4-ad
    sharedscripts
    postrotate
        systemctl reload samba4-ad-backend > /dev/null 2>&1 || true
    endscript
}
```
