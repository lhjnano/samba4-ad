# Samba 4 AD Manager — User Guide

> **Version 0.1.0** | June 2026 | Apache-2.0 License

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Installation](#3-installation)
4. [Initial Setup (Domain Provisioning)](#4-initial-setup-domain-provisioning)
5. [Login](#5-login)
6. [Dashboard](#6-dashboard)
7. [User Management](#7-user-management)
8. [Group Management](#8-group-management)
9. [Computer Management](#9-computer-management)
10. [Organizational Unit (OU) Management](#10-organizational-unit-ou-management)
11. [Group Policy Object (GPO) Management](#11-group-policy-object-gpo-management)
12. [DNS Management](#12-dns-management)
13. [Domain Policies](#13-domain-policies)
14. [System Logs](#14-system-logs)
15. [Settings](#15-settings)
16. [API Reference](#16-api-reference)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Introduction

**Samba 4 AD Manager** is a web-based administration portal for managing a Samba 4 Active Directory Domain Controller. It provides a modern, intuitive interface for managing users, groups, computers, organizational units, group policies, DNS zones, and domain-level security policies — replacing the need for Windows Server administration tools.

### Key Features

- **Full AD Management**: Users, groups, computers, OUs, GPOs
- **DNS Administration**: Forward and reverse zone management
- **Security Policies**: Password and lockout policy configuration
- **Real-time Monitoring**: Dashboard with system health, service status, and alerts
- **REST API**: Full programmatic access via JWT-authenticated API
- **Multi-language UI**: Korean interface with English API responses
- **Open Source**: Apache-2.0 licensed

---

## 2. System Requirements

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS+ |
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 4+ GB |
| Disk | 20 GB | 50+ GB |
| Python | 3.10+ | 3.12+ |
| Node.js | 18+ | 22 LTS |
| Samba | 4.15+ | 4.18+ |

### Network Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8000 | TCP | Web management portal |
| 53 | TCP/UDP | DNS |
| 88 | TCP/UDP | Kerberos |
| 389 | TCP | LDAP |
| 445 | TCP | SMB |
| 464 | TCP/UDP | Kerberos password change |
| 636 | TCP | LDAPS |

### Client Requirements

- Modern web browser (Chrome 90+, Firefox 88+, Edge 90+, Safari 14+)
- JavaScript enabled
- Minimum screen resolution: 1280×720

---

## 3. Installation

### Quick Install

```bash
# Clone the repository
git clone https://github.com/lhjnano/samba4-ad.git
cd samba4-ad

# Run the installer
chmod +x install.sh
sudo ./install.sh
```

The installer will:
1. Install Samba 4 and related packages via `apt`
2. Create a Python virtual environment
3. Install all Python dependencies
4. Build the React frontend
5. Configure and enable the systemd service
6. Start the web portal on port 8000

### Manual Install

```bash
# Install system dependencies
sudo apt update
sudo apt install -y samba smbclient winbind ldap-utils python3-venv nodejs npm

# Backend setup
cd backend
python3 -m venv .venv
.venv/bin/pip install -e .

# Frontend build
cd ../frontend
npm install
npm run build

# Start the server
cd ../backend
../backend/.venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000
```

### systemd Service

The installer creates `/etc/systemd/system/samba-ad-manager.service`:

```ini
[Unit]
Description=Samba 4 AD Manager
After=network.target

[Service]
Type=simple
User=administrator
WorkingDirectory=/opt/samba4-ad/backend
EnvironmentFile=/opt/samba4-ad/.env
ExecStart=/opt/samba4-ad/backend/.venv/bin/uvicorn src.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Manage the service:

```bash
sudo systemctl start samba-ad-manager     # Start
sudo systemctl stop samba-ad-manager      # Stop
sudo systemctl restart samba-ad-manager   # Restart
sudo systemctl status samba-ad-manager    # Status
sudo systemctl enable samba-ad-manager    # Auto-start on boot
```

---

## 4. Initial Setup (Domain Provisioning)

When you first access the portal, the **Setup Wizard** will appear if no domain has been provisioned.

### Setup Wizard Steps

1. **Domain Information**
   - **Domain Name**: Your AD domain (e.g., `corp.example.com`)
   - **NetBIOS Name**: Short domain name (e.g., `CORP`, max 15 chars)
   - **Admin Password**: Initial Directory Administrator password (min 8 chars)

2. **DNS Configuration**
   - **DNS Forwarder**: Upstream DNS server (e.g., `8.8.8.8`)
   - The DC itself becomes the primary DNS for the domain

3. **Review & Provision**
   - Verify all settings
   - Click **Provision Domain** to start

4. **Complete**
   - The system runs `samba-tool domain provision`
   - Samba services are restarted
   - You are redirected to the login page

> **Note**: Provisioning takes 1-3 minutes. Do not close the browser during this process.

---

## 5. Login

### Default Credentials (Mock Mode)

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |

### Login Process

1. Navigate to `http://<server-ip>:8000`
2. Enter your username and password
3. Click **Login**
4. You will be redirected to the Dashboard

### Session Management

- JWT token expires after **8 hours**
- The system auto-redirects to login on token expiry
- Click the **Logout** button in the top-right corner to end the session manually

---

## 6. Dashboard

The Dashboard provides an at-a-glance overview of your Active Directory environment.

### Sections

#### Stat Cards (Top Row)
- **Total Users**: All user accounts in the domain
- **Groups**: Security and distribution groups
- **Computers**: Domain-joined machines
- **Organizational Units**: Container structure
- **GPOs**: Group Policy Objects
- **Domain Controllers**: DC count

#### Login Trend Chart
- 7-day login activity bar chart
- Shows total authentication events per day

#### System Resources
- **CPU Usage**: Current processor utilization
- **Memory**: RAM usage percentage
- **Disk**: Storage usage

#### Service Status
Real-time health of critical AD services:
- LDAP (port 389)
- Kerberos (port 88)
- DNS (port 53)
- SMB (port 445)

#### OU Distribution
User count per Organizational Unit — visual bar chart.

#### Recent Alerts
Latest security events (account lockouts, failed logins, etc.).

---

## 7. User Management

Access: **Sidebar → Users**

### Listing Users
- Paginated list (50 per page by default)
- Columns: Username, Display Name, Email, Department, Status, OU, Last Logon
- Click any row to view user details

### Searching & Filtering
- **Search bar**: Filter by username, display name, or email
- **OU filter**: Show users in a specific OU
- **Status filter**: All / Active / Disabled / Locked

### Actions

#### Create User
1. Click **+ Add User**
2. Fill in the form:
   - **Username** (required): Login ID (e.g., `jdoe`)
   - **Display Name** (required): Full name (e.g., `John Doe`)
   - **Email**: Email address
   - **Department**: Department name
   - **Job Title**: Position title
   - **OU**: Target Organizational Unit
   - **Password**: Initial password (min 8 chars)
3. Click **Create**

#### Edit User
1. Click on a user row
2. Modify fields in the drawer
3. Click **Save**

#### Reset Password
1. Select a user
2. Click **Reset Password**
3. Enter the new password
4. Confirm

#### Disable / Enable User
1. Select a user
2. Click **Disable** or **Enable**

#### Delete User
1. Select a user
2. Click **Delete**
3. Confirm the action

> **Warning**: Deletion is permanent. Disable the account instead if you may need it later.

#### Export to CSV
Click **Export** to download all users as a CSV file.

---

## 8. Group Management

Access: **Sidebar → Groups**

### Listing Groups
- Columns: Name, Description, Type, Scope, Member Count, OU

### Actions

#### Create Group
1. Click **+ Add Group**
2. Enter:
   - **Name** (required): Group name
   - **Description**: Purpose of the group
   - **Type**: Security or Distribution
   - **Scope**: Domain Local, Global, or Universal
   - **OU**: Target OU
3. Click **Create**

#### Manage Members
1. Click on a group
2. Navigate to **Members** tab
3. Add or remove user DNs

#### Export to CSV
Download all groups as CSV.

---

## 9. Computer Management

Access: **Sidebar → Computers**

### Listing Computers
- Columns: Hostname, OS, OU, Status, Last Logon, IP Address

### Actions

#### View Details
Click a computer row to see:
- Operating system details
- Last logon time
- Group memberships
- Security identifiers

#### Disable / Enable
- Disable a computer account to prevent domain access

#### Reset Account
Reset the computer's domain trust account (useful after re-imaging)

#### Delete
Remove a computer from the domain

---

## 10. Organizational Unit (OU) Management

Access: **Sidebar → OUs**

### OU Tree
- Hierarchical tree view of all OUs
- Shows user and computer counts per OU

### Actions

#### Create OU
1. Click **+ Add OU**
2. Enter:
   - **Name** (required): OU name
   - **Description**: Purpose
   - **Parent OU**: Parent container (optional)
3. Click **Create**

#### Edit / Delete
- Rename OUs or update descriptions
- Delete OUs (must be empty)

---

## 11. Group Policy Object (GPO) Management

Access: **Sidebar → GPOs**

### Listing GPOs
- Columns: Name, Status, Links, Computer Version, User Version, Modified

### Actions

#### Create GPO
1. Click **+ Create GPO**
2. Enter name and description
3. Select target OU (optional)

#### Link / Unlink
- Link a GPO to one or more OUs
- Set enforcement mode

#### Enable / Disable
- Disable a GPO without deleting it

#### Backup
Export GPO settings for archival

---

## 12. DNS Management

Access: **Sidebar → DNS**

### Zone List
- Forward zones (e.g., `corp.example.com`)
- Reverse zones (e.g., `1.168.192.in-addr.arpa`)

### Actions

#### View Records
1. Select a zone
2. View all DNS records (A, CNAME, MX, SRV, TXT, PTR, SOA, NS)

#### Add Record
1. Select a zone
2. Click **+ Add Record**
3. Enter:
   - **Name**: Record name (use `@` for zone root)
   - **Type**: Record type (A, CNAME, MX, etc.)
   - **Value**: IP address or hostname
   - **TTL**: Time to live (default: 3600)
4. Click **Create**

#### Delete Record
1. Find the record
2. Click the trash icon
3. Confirm deletion

---

## 13. Domain Policies

Access: **Sidebar → Policies**

### Password Policy

| Setting | Description | Default |
|---------|-------------|---------|
| Complex Passwords | Require upper, lower, digits, symbols | Enabled |
| Minimum Length | Minimum password characters | 7 |
| Password History | Remember last N passwords | 24 |
| Maximum Age (days) | Force password change interval | 42 |
| Minimum Age (days) | Days before password can change | 1 |

### Lockout Policy

| Setting | Description | Default |
|---------|-------------|---------|
| Lockout Threshold | Failed attempts before lockout | 0 (disabled) |
| Lockout Duration (min) | How long account stays locked | 30 |
| Reset Counter (min) | Time before counter resets | 30 |

### Updating Policies
1. Modify the desired fields
2. Click **Save Changes**
3. Changes take effect immediately for new sessions

---

## 14. System Logs

Access: **Sidebar → Logs**

### Log Viewer
- Real-time log entries from Samba, Kerberos, LDAP, DNS
- Auto-refresh every 10 seconds

### Filtering
- **Level**: Info, Warning, Error
- **Source**: Filter by service
- **Search**: Full-text search in log messages

### Log Columns
- **Timestamp**: When the event occurred
- **Level**: Severity (info/warning/error)
- **Source**: Which service generated the log
- **Message**: Event details

---

## 15. Settings

Access: **Sidebar → Settings**

### Notification Settings
- Alert email configuration
- Notification preferences

### System Information
- Application version
- Samba version
- Server OS and kernel
- Domain functional level

---

## 16. API Reference

The full interactive API documentation is available at:
- **Swagger UI**: `http://<server-ip>:8000/docs`
- **ReDoc**: `http://<server-ip>:8000/redoc`
- **OpenAPI JSON**: `http://<server-ip>:8000/openapi.json`

### Authentication

All API endpoints (except `/health`, `/auth/login`, and `/setup/*`) require a JWT Bearer token:

```bash
# Login to get token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Use token for requests
curl http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer <your-token>"
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/dashboard/stats` | Dashboard summary |
| GET | `/api/v1/users` | List users |
| POST | `/api/v1/users` | Create user |
| GET | `/api/v1/groups` | List groups |
| GET | `/api/v1/computers` | List computers |
| GET | `/api/v1/ou` | List OUs |
| GET | `/api/v1/gpo` | List GPOs |
| GET | `/api/v1/dns/zones` | List DNS zones |
| GET | `/api/v1/logs` | System logs |
| GET | `/api/v1/policies/domain` | Domain policies |

---

## 17. Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status samba-ad-manager

# View logs
sudo journalctl -u samba-ad-manager -n 50

# Check if port 8000 is in use
sudo ss -tlnp | grep 8000
```

### Cannot Access Web Portal

1. Verify the service is running: `systemctl is-active samba-ad-manager`
2. Check firewall rules: `sudo ufw status`
3. Verify network connectivity: `ping <server-ip>`
4. Check the `.env` file for correct settings

### Login Fails

- **Mock mode**: Default credentials are `admin`/`admin`
- **LDAP mode**: Verify the Samba DC is running: `samba -V`
- Check if the LDAP service is reachable: `ldapsearch -x -H ldap://localhost`

### Frontend Shows Blank Page

1. Rebuild the frontend: `cd frontend && npm run build`
2. Restart the service: `sudo systemctl restart samba-ad-manager`
3. Clear browser cache

### Reset to Mock Mode

Edit `.env`:
```
APP_MODE=mock
```
Then restart: `sudo systemctl restart samba-ad-manager`

---

## License

This project is licensed under the **Apache License, Version 2.0**.

## Support

- **GitHub**: https://github.com/lhjnano/samba4-ad
- **Issues**: https://github.com/lhjnano/samba4-ad/issues
