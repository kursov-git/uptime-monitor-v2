#!/bin/bash
# =============================================================================
#  VPS Security Hardening Script for Uptime Monitor
#  Run as root on Ubuntu 20.04/22.04:  bash harden.sh
# =============================================================================
set -e

echo "🔒 Starting VPS security hardening..."
echo ""

# ─────────────────────────────────────────────
# 1. System Updates
# ─────────────────────────────────────────────
echo "📦 [1/5] Updating system packages..."
apt update && apt upgrade -y

# ─────────────────────────────────────────────
# 2. UFW Firewall
# ─────────────────────────────────────────────
echo "🧱 [2/5] Configuring UFW firewall..."
apt install ufw -y

# Reset to clean state
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow only essential ports
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS (future)'

# Enable (non-interactive)
ufw --force enable
echo "   ✅ UFW enabled. Status:"
ufw status verbose

# ─────────────────────────────────────────────
# 3. Fail2ban
# ─────────────────────────────────────────────
echo "🛡️  [3/5] Installing and configuring fail2ban..."
apt install fail2ban -y

# Create custom jail config (won't be overwritten on updates)
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban
echo "   ✅ Fail2ban active. Status:"
fail2ban-client status sshd

# ─────────────────────────────────────────────
# 4. SSH Hardening
# ─────────────────────────────────────────────
echo "🔑 [4/5] Hardening SSH configuration..."

SSHD_CONFIG="/etc/ssh/sshd_config"

# Backup original config
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d)"

# Apply hardening (using sed to modify in-place)
# Disable password authentication
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' "$SSHD_CONFIG"
sed -i 's/^#\?UsePAM.*/UsePAM no/' "$SSHD_CONFIG"

# Restrict root login to key-based only
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"

# Disable X11 forwarding
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' "$SSHD_CONFIG"

# Set max auth tries
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "$SSHD_CONFIG"

# Disable empty passwords
sed -i 's/^#\?PermitEmptyPasswords.*/PermitEmptyPasswords no/' "$SSHD_CONFIG"

# Restart SSH
systemctl restart sshd
echo "   ✅ SSH hardened (password login disabled, key-only access)"

# ─────────────────────────────────────────────
# 5. Additional Hardening
# ─────────────────────────────────────────────
echo "🔧 [5/5] Additional hardening..."

# Disable unused network protocols
cat >> /etc/sysctl.conf << 'EOF'

# --- Security Hardening ---
# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Disable IP source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Enable SYN flood protection
net.ipv4.tcp_syncookies = 1

# Log suspicious packets
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
EOF

sysctl -p

# Install automatic security updates
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true

echo ""
echo "============================================="
echo "  ✅ VPS HARDENING COMPLETE"
echo "============================================="
echo ""
echo "  Summary of changes:"
echo "  ✅ System packages updated"
echo "  ✅ UFW firewall: allow 22, 80, 443 only"
echo "  ✅ Fail2ban: SSH jail active (3 attempts → 2h ban)"
echo "  ✅ SSH: password login disabled, key-only"
echo "  ✅ Kernel: SYN flood protection, source routing disabled"
echo "  ✅ Unattended security updates enabled"
echo ""
echo "  ⚠️  IMPORTANT: Keep your SSH key safe!"
echo "  ⚠️  If you lose your key, you lose access!"
echo ""
echo "  Next steps:"
echo "  1. Read docs/operations/runbook.md before the next rollout"
echo "  2. Verify: curl http://YOUR_IP:3000  (should be refused)"
echo "  3. Verify: curl -I http://YOUR_IP  (check security headers)"
echo "============================================="
