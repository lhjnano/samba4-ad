#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Kerberos SSO Keytab Setup Script
# Run on the Samba AD DC server as root.
#
# Usage:
#   sudo ./scripts/setup-kerberos-keytab.sh --spn HTTP/ad-manager.corp.local --realm CORP.LOCAL
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SPN=""
REALM=""
KEYTAB="/etc/krb5.keytab"
ADMIN_USER="Administrator"

while [[ $# -gt 0 ]]; do
    case $1 in
        --spn) SPN="$2"; shift 2 ;;
        --realm) REALM="$2"; shift 2 ;;
        --keytab) KEYTAB="$2"; shift 2 ;;
        --admin) ADMIN_USER="$2"; shift 2 ;;
        *) shift ;;
    esac
done

if [[ -z "$SPN" ]]; then
    error "--spn is required (e.g. HTTP/ad-manager.corp.local)"
fi
if [[ -z "$REALM" ]]; then
    error "--realm is required (e.g. CORP.LOCAL)"
fi

info "Setting up Kerberos SSO keytab..."
info "  SPN:     $SPN"
info "  Realm:   $REALM"
info "  Keytab:  $KEYTAB"

# Step 1: Add SPN to the computer account
info "Registering SPN in Active Directory..."
samba-tool spn add "$SPN" "$(hostname -s)$" 2>/dev/null || \
    warn "SPN may already exist. Continuing..."

# Step 2: Export keytab
info "Exporting keytab..."
samba-tool domain exportkeytab "$KEYTAB" \
    --principal="${SPN}@${REALM}" 2>/dev/null || \
    error "Failed to export keytab. Check admin credentials."

chmod 640 "$KEYTAB"
chown root:samba-adm "$KEYTAB" 2>/dev/null || true
ok "Keytab exported to $KEYTAB"

# Step 3: Update configuration
CONF="/etc/samba-ad-manager/env"
if [[ -f "$CONF" ]]; then
    info "Updating $CONF..."
    sed -i 's/^KERBEROS_ENABLED=.*/KERBEROS_ENABLED=true/' "$CONF" 2>/dev/null || \
        echo "KERBEROS_ENABLED=true" >> "$CONF"
    sed -i "s|^KERBEROS_KEYTAB=.*|KERBEROS_KEYTAB=$KEYTAB|" "$CONF" 2>/dev/null || \
        echo "KERBEROS_KEYTAB=$KEYTAB" >> "$CONF"
    sed -i "s|^KERBEROS_SPN=.*|KERBEROS_SPN=$SPN|" "$CONF" 2>/dev/null || \
        echo "KERBEROS_SPN=$SPN" >> "$CONF"
    ok "Configuration updated"
else
    warn "$CONF not found. Add these manually:"
    echo "  KERBEROS_ENABLED=true"
    echo "  KERBEROS_KEYTAB=$KEYTAB"
    echo "  KERBEROS_SPN=$SPN"
fi

# Step 4: Install gssapi
info "Installing Python gssapi..."
VENV="$(dirname $(dirname $(realpath $0)))/backend/.venv"
if [[ -d "$VENV" ]]; then
    "$VENV/bin/pip" install gssapi -q 2>/dev/null || \
        warn "gssapi install failed. Install manually: pip install gssapi"
else
    warn "Virtual environment not found at $VENV"
fi

# Step 5: Restart service
info "Restarting samba-ad-manager..."
systemctl restart samba-ad-manager 2>/dev/null || warn "Could not restart service"

ok "Kerberos SSO setup complete!"
echo ""
echo -e "  ${YELLOW}Browser config:${NC}"
echo "  Add the SPN URL to your browser's trusted sites:"
echo "    $SPN"
echo ""
