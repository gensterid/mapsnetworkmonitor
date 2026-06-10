# VPN Setup — Multi-VPN-Server (Phase 3.3)

Petunjuk one-time setup di Proxmox host + CT206 supaya VPN connection
manager (Node.js service di dalam aplikasi) bisa mengelola unit
OpenVPN client via systemd.

Setup ini wajib dijalankan sekali. Setelah itu, semua VPN dikelola
via UI SuperAdmin di aplikasi.

## Prasyarat

- CT206 sudah punya `openvpn` + `bridge-utils` (lihat panduan Phase 1)
- `/dev/net/tun` accessible di dalam container (sudah dilakukan di
  setup Phase 1 — bind mount di `/etc/pve/lxc/206.conf`)
- `cap_net_admin` capability tersedia di container

## Step 1 — Verify openvpn + systemctl

Di **CT206** (di dalam container):

```bash
openvpn --version | head -1
which systemctl
which sudo
```

Semua harus ada. Kalau `sudo` belum ada: `apt install -y sudo`.

## Step 2 — Buat dedicated user untuk app (opsional tapi recommended)

Saat ini app run as root. Untuk security yang lebih baik, run as
non-root user. Kalau Anda OK dengan run sebagai root untuk sekarang,
**skip step ini** dan lanjut Step 3.

Kalau mau pisah user:
```bash
useradd -r -s /bin/false netmonitor
chown -R netmonitor:netmonitor /opt/app
```

## Step 3 — Setup sudoers rule

Aplikasi butuh exec `systemctl` + `ip addr show` tanpa password prompt.

```bash
# Di CT206
sudo visudo -f /etc/sudoers.d/netmonitor-vpn
```

Paste config ini (ganti `root` dengan user app kalau pakai dedicated user):

```
# Allow netmonitor app to manage OpenVPN units only.
# Pattern terbatas hanya untuk unit yang match openvpn-vpn-*
# (UUID-based name dari connection manager).

# Format: <user> <host>=NOPASSWD: <command path with arg pattern>
root ALL=NOPASSWD: /bin/systemctl daemon-reload
root ALL=NOPASSWD: /bin/systemctl start openvpn-vpn-*
root ALL=NOPASSWD: /bin/systemctl stop openvpn-vpn-*
root ALL=NOPASSWD: /bin/systemctl restart openvpn-vpn-*
root ALL=NOPASSWD: /bin/systemctl enable openvpn-vpn-*
root ALL=NOPASSWD: /bin/systemctl disable openvpn-vpn-*
root ALL=NOPASSWD: /bin/systemctl show openvpn-vpn-*

# /sbin/ip dipakai untuk auto-discover tunnel IP
root ALL=NOPASSWD: /sbin/ip -4 addr show *
```

Save (Ctrl+O di nano), exit.

**Verify**:
```bash
sudo -n /bin/systemctl daemon-reload
echo $?
```

Output harus `0`. Kalau `1` atau muncul password prompt = sudoers tidak benar.

## Step 4 — Restart aplikasi

Setelah sudoers aktif, restart aplikasi supaya connection manager
detect bisa exec systemctl:

```bash
pm2 restart monitoring-api
pm2 logs monitoring-api --lines 50
```

Cari log line:
```
[vpn-conn-mgr] Starting connection manager
[vpn-conn-mgr] Loading enabled VPN servers
[vpn-conn-mgr] Started
```

Kalau muncul itu = manager siap.

## Step 5 — Add VPN via UI

Login sebagai SuperAdmin → Settings → VPN Servers → **+ Tambah VPN Server**.

Isi form dengan data VPN VPS Anda:
- Name: "VPN Jakarta"
- Type: OpenVPN
- Host: `id.genster.net`
- Port: `1119`
- Username: `maps2026` (atau username Anda)
- Password: (password Anda)
- Client Subnet: `172.18.19.0/24`
- Mode: TAP
- Cipher: AES-256-CBC
- Auth: SHA1
- Verify Server Cert: **OFF**
- CA Cert: paste isi `cacert2025.crt` (sama dengan Phase 1 POC)

Save. Status akan jadi 🟡 connecting → 🟢 connected dalam 10-30 detik.

## Troubleshooting

### Manager tidak start

Cek log app:
```bash
pm2 logs monitoring-api --err
```

- `EACCES /etc/openvpn/client`: directory tidak writable. Cek owner +
  permission, atau `mkdir -p` manual dulu.
- `daemon-reload failed`: sudoers tidak benar. Re-do Step 3.

### VPN stuck "connecting"

```bash
# Cek systemd unit langsung
systemctl status openvpn-vpn-<id>
journalctl -u openvpn-vpn-<id> --no-pager -n 50
```

Common issues:
- Wrong password → `auth failed` di log
- Wrong CA → `TLS error: certificate verify failed`
- Wrong cipher → `cipher mismatch`

### Tunnel IP tidak ke-detect

Pastikan subnet di config app **match** subnet yang server VPN assign.
Cek manual:
```bash
ip -4 addr show tap0
```

Harus muncul IP dari subnet yang Anda set di app.

## File yang di-generate manager

Per VPN dengan ID `<uuid>`, manager bikin:
- `/etc/openvpn/client/vpn-<uuid>.conf` — config OpenVPN
- `/etc/openvpn/credentials/vpn-<uuid>.txt` — username + password (mode 600)
- `/etc/systemd/system/openvpn-vpn-<uuid>.service` — systemd unit
- `/var/log/openvpn/vpn-<uuid>.log` — log file

Jangan edit manual — akan di-overwrite saat operator save dari UI.

## Disable Manager (dev/test)

Untuk run app di environment non-Linux (Windows dev) atau test mode:

```bash
export VPN_DISABLE_SYSTEMD=1
```

Connection manager tetap track DB status untuk testing UI, tapi
skip semua exec systemctl. Aman untuk dev.

## Untuk override path file (testing)

```bash
export VPN_BASE_DIR=/tmp/vpn-test
```

Manager akan tulis file ke `/tmp/vpn-test/openvpn/client/...` dst.
Berguna untuk integration test atau dry-run.
