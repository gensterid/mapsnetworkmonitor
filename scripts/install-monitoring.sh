#!/bin/bash

# Manual Monitoring Installation Script for Proxmox (Debian/Ubuntu)
# This script installs Prometheus and Grafana without Docker.

set -e # Exit on error

echo "🚀 Starting Manual Monitoring Installation..."

# 1. Check for Sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root or with sudo"
  exit 1
fi

# 2. Install Prometheus
echo "📦 Installing Prometheus..."
apt-get update
apt-get install -y prometheus

# 3. Configure Prometheus
echo "⚙️ Configuring Prometheus..."
cat <<EOF > /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'mikrotik-monitor-api'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['localhost:3001']
EOF

systemctl restart prometheus
systemctl enable prometheus

# 4. Install Grafana
echo "📦 Installing Grafana..."
apt-get install -y apt-transport-https software-properties-common wget
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | tee -a /etc/apt/sources.list.d/grafana.list

apt-get update
apt-get install -y grafana

# 5. Enable and Start Grafana
echo "🚀 Starting Grafana..."
systemctl daemon-reload
systemctl start grafana-server
systemctl enable grafana-server

echo "✅ Monitoring Installation Completed!"
echo "------------------------------------------------"
echo "Prometheus: http://$(hostname -I | awk '{print $1}'):9090"
echo "Grafana:    http://$(hostname -I | awk '{print $1}'):3000"
echo "Initial Grafana Login: admin / admin"
echo "------------------------------------------------"
