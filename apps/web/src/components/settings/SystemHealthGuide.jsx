import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
    ShieldCheck, Terminal, Check, Copy, AlertTriangle, Info,
    HardDrive, Database, Server, Cpu, Activity, RefreshCw, Clock,
    FileText, Wrench, AlertCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import clsx from 'clsx';

/**
 * System Health & Maintenance Guide
 * Only rendered for superadmin. Contains copy-ready shell commands + SQL
 * snippets for all the routine checks and common troubleshooting steps
 * discussed during production setup. Keeps institutional knowledge in the
 * product so it doesn't live only in chat/email.
 */
export default function SystemHealthGuide({ currentUser }) {
    const [openSection, setOpenSection] = useState('daily');
    const [copiedKey, setCopiedKey] = useState(null);

    if (currentUser?.role !== 'superadmin') {
        return (
            <div className="max-w-2xl">
                <Card className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-6 flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                        <div>
                            <p className="text-amber-200 font-bold">Akses Terbatas</p>
                            <p className="text-slate-400 text-sm mt-1">
                                Panduan maintenance sistem hanya dapat diakses oleh Super Administrator.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const handleCopy = (key, text) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const sections = [
        {
            id: 'daily',
            title: 'Pengecekan Harian',
            icon: Activity,
            description: 'Cek ini 1x sehari atau kapan ada keluhan',
            color: 'text-emerald-400',
            items: DAILY_CHECKS,
        },
        {
            id: 'weekly',
            title: 'Pengecekan Mingguan',
            icon: Clock,
            description: 'Cek setiap minggu untuk kesehatan database',
            color: 'text-blue-400',
            items: WEEKLY_CHECKS,
        },
        {
            id: 'monthly',
            title: 'Maintenance Bulanan',
            icon: Wrench,
            description: 'Dilakukan bulanan, atau kalau disk > 75%',
            color: 'text-purple-400',
            items: MONTHLY_CHECKS,
        },
        {
            id: 'troubleshoot',
            title: 'Troubleshooting Masalah Umum',
            icon: AlertCircle,
            description: 'Rujuk ke sini ketika ada alert atau sistem aneh',
            color: 'text-rose-400',
            items: TROUBLESHOOTING,
        },
        {
            id: 'reference',
            title: 'Referensi Konfigurasi',
            icon: FileText,
            description: 'Nilai optimal untuk setup saat ini',
            color: 'text-amber-400',
            items: REFERENCE,
        },
    ];

    return (
        <div className="max-w-5xl space-y-4">
            {/* Header */}
            <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-white">Panduan Pemeliharaan Sistem</h2>
                            <p className="text-slate-400 text-sm mt-1">
                                Checklist dan command siap-copy untuk menjaga sistem tetap sehat. Semua perintah di sini harus dijalankan di server Proxmox (SSH) sebagai root atau sudo.
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-xs">
                                <span className="px-2 py-1 rounded bg-primary/10 text-primary font-bold">SUPERADMIN ONLY</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-500">v1.2.x</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sections */}
            {sections.map((section) => (
                <Card key={section.id} className="bg-slate-900/40 border-slate-800 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setOpenSection(openSection === section.id ? null : section.id)}
                        className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/30 transition-colors"
                    >
                        <section.icon className={clsx('w-5 h-5', section.color)} />
                        <div className="flex-1 text-left">
                            <div className="font-bold text-white text-sm">{section.title}</div>
                            <div className="text-xs text-slate-500">{section.description}</div>
                        </div>
                        <span className="text-xs text-slate-600 font-mono">{section.items.length} items</span>
                        {openSection === section.id
                            ? <ChevronDown className="w-4 h-4 text-slate-500" />
                            : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </button>

                    {openSection === section.id && (
                        <div className="border-t border-slate-800 divide-y divide-slate-800/50">
                            {section.items.map((item, idx) => (
                                <GuideItem
                                    key={idx}
                                    item={item}
                                    copiedKey={copiedKey}
                                    onCopy={handleCopy}
                                    itemKey={`${section.id}-${idx}`}
                                />
                            ))}
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}

function GuideItem({ item, copiedKey, onCopy, itemKey }) {
    return (
        <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
                <div className={clsx(
                    'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                    item.level === 'critical' ? 'bg-rose-500/10 text-rose-400' :
                    item.level === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-slate-700/50 text-slate-400'
                )}>
                    {item.level === 'critical' ? <AlertTriangle className="w-3.5 h-3.5" /> :
                     item.level === 'warning' ? <AlertCircle className="w-3.5 h-3.5" /> :
                     <Info className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-white">{item.title}</h4>
                    {item.description && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                    )}
                </div>
            </div>

            {item.command && (
                <div className="relative ml-10">
                    <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 pr-12 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                        {item.command}
                    </pre>
                    <button
                        type="button"
                        onClick={() => onCopy(itemKey, item.command)}
                        className="absolute top-2 right-2 px-2 py-1 bg-slate-800/80 hover:bg-slate-700 rounded text-[10px] text-slate-300 font-medium flex items-center gap-1 transition-colors"
                    >
                        {copiedKey === itemKey ? (
                            <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                        ) : (
                            <><Copy className="w-3 h-3" /> Copy</>
                        )}
                    </button>
                </div>
            )}

            {item.expected && (
                <div className="ml-10 text-xs bg-emerald-500/5 border border-emerald-500/10 rounded-md p-2">
                    <span className="text-emerald-400 font-bold uppercase text-[10px] tracking-wider">Yang Diharapkan:</span>{' '}
                    <span className="text-slate-300">{item.expected}</span>
                </div>
            )}

            {item.troubleshoot && (
                <div className="ml-10 text-xs bg-amber-500/5 border border-amber-500/10 rounded-md p-2">
                    <span className="text-amber-400 font-bold uppercase text-[10px] tracking-wider">Kalau Gagal:</span>{' '}
                    <span className="text-slate-300">{item.troubleshoot}</span>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------
// Content
// -----------------------------------------------------------------------------

const DAILY_CHECKS = [
    {
        title: 'Cek PM2 Processes Running',
        description: 'Pastikan monitoring-api dan monitoring-web status online.',
        command: 'pm2 list',
        expected: 'monitoring-api dan monitoring-web status "online", uptime > 0.',
        troubleshoot: 'Kalau stopped/errored: `pm2 restart monitoring-api monitoring-web` lalu `pm2 logs monitoring-api --lines 50`',
        level: 'critical',
    },
    {
        title: 'Cek Redis Running',
        description: 'BullMQ queue butuh Redis. Kalau Redis down, polling & sync berhenti.',
        command: 'redis-cli ping',
        expected: 'Output: PONG',
        troubleshoot: '`systemctl restart redis-server` lalu cek log `tail -30 /var/log/redis/redis-server.log`',
        level: 'critical',
    },
    {
        title: 'Cek Disk Usage',
        description: 'Disk > 85% akan menyebabkan Redis gagal save, PostgreSQL tidak bisa insert, sistem stuck.',
        command: 'df -h /',
        expected: 'Use% < 80%.',
        troubleshoot: 'Bersihkan log journald: `sudo journalctl --vacuum-size=500M`, hapus backup lama: `find /opt/app/backups -name "auto-bkp-*" -mtime +14 -delete`',
        level: 'warning',
    },
    {
        title: 'Cek Backup Terbaru Ada',
        description: 'Auto-backup harian. Kalau tidak ada dalam 48 jam, ada masalah di backup service.',
        command: 'ls -lah /opt/app/backups/ | grep auto-bkp | tail -5',
        expected: 'Minimal 1 file auto-bkp-*.sql.gz dari < 48 jam lalu.',
        troubleshoot: 'Cek log: `pm2 logs monitoring-api --lines 200 --nostream | grep -iE "backup"`. Backup manual: `sudo -u postgres pg_dump mikrotik_monitor | gzip > /opt/app/backups/manual_$(date +%Y%m%d).sql.gz`',
        level: 'warning',
    },
    {
        title: 'Cek Error Terakhir',
        description: 'Scan 1 jam terakhir untuk error kritis.',
        command: 'pm2 logs monitoring-api --lines 500 --nostream 2>&1 | grep -iE "error|fail|fatal" | tail -20',
        expected: 'Error occasional (network flaky) OK. Error berulang untuk service yang sama = perlu investigasi.',
        level: 'info',
    },
];

const WEEKLY_CHECKS = [
    {
        title: 'Status Compression Hypertable',
        description: 'Compression harus aktif & punya chunks compressed. Kalau 0 compressed, policy mungkin tidak jalan.',
        command: `sudo -u postgres psql -d mikrotik_monitor -c "
SELECT h.hypertable_name,
       pg_size_pretty(hypertable_size(format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass)) AS size,
       (SELECT COUNT(*) FROM timescaledb_information.chunks c WHERE c.hypertable_name = h.hypertable_name AND c.is_compressed) AS compressed,
       (SELECT COUNT(*) FROM timescaledb_information.chunks c WHERE c.hypertable_name = h.hypertable_name) AS total
FROM timescaledb_information.hypertables h;
"`,
        expected: 'compressed > 0 untuk tabel dengan total > 2. Ukuran tabel stabil (tidak naik > 20%/minggu).',
        troubleshoot: 'Manual compress: `SELECT compress_chunk(show_chunks(\'nama_tabel\', older_than => INTERVAL \'7 days\'));`',
        level: 'info',
    },
    {
        title: 'Queue Backlog BullMQ',
        description: 'Kalau queue terus bertambah, worker tidak mengejar. Bisa jadi bottleneck.',
        command: 'redis-cli LLEN bull:router-sync:wait && redis-cli LLEN bull:olt-sync:wait',
        expected: 'Kedua nilai < 50. Biasanya 0-10.',
        troubleshoot: 'Kalau > 100 terus, restart API: `pm2 restart monitoring-api`. Kalau Redis stuck, cek RDB error: `redis-cli INFO persistence | grep rdb_last_bgsave_status`',
        level: 'warning',
    },
    {
        title: 'Retention Setting Per Tenant',
        description: 'Pastikan retention sesuai rencana (interface_metrics=400, sisanya=60).',
        command: `sudo -u postgres psql -d mikrotik_monitor -c "SELECT key, value, COUNT(DISTINCT tenant_id) AS tenants FROM app_settings WHERE key LIKE '%retention%' GROUP BY key, value ORDER BY key;"`,
        expected: 'Tidak ada nilai > 400 untuk non-traffic. Audit logs ≤ 365. Traffic metrics 400.',
        level: 'info',
    },
    {
        title: 'Ghost ONU Yang Perlu Dibersihkan',
        description: 'ONU yang di-archive > 60 hari akan auto hard-delete, tapi cek manual kalau ada outlier.',
        command: `sudo -u postgres psql -d mikrotik_monitor -c "SELECT name, host, archived_at, NOW() - archived_at AS age FROM onus WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 20;"`,
        expected: 'Daftar pendek, age < 60 hari.',
        level: 'info',
    },
];

const MONTHLY_CHECKS = [
    {
        title: 'VACUUM ANALYZE Tabel Besar',
        description: 'Reclaim dead tuples dan update query planner stats.',
        command: `sudo -u postgres psql -d mikrotik_monitor <<'EOF'
VACUUM ANALYZE router_interface_metrics;
VACUUM ANALYZE device_performance_history;
VACUUM ANALYZE router_metrics;
VACUUM ANALYZE alerts;
VACUUM ANALYZE pppoe_sessions;
VACUUM ANALYZE audit_logs;
EOF`,
        expected: 'Tidak ada error. Selesai < 5 menit.',
        level: 'info',
    },
    {
        title: 'Bersihkan Systemd Journal',
        description: '/var/log/journal bisa bengkak sampai GB. Vacuum rutin.',
        command: 'sudo journalctl --vacuum-size=500M',
        expected: 'Output menunjukkan space freed.',
        level: 'info',
    },
    {
        title: 'Cek Ukuran Tabel Top 10',
        description: 'Identifikasi tabel yang growing tidak normal.',
        command: `sudo -u postgres psql -d mikrotik_monitor -c "SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;"`,
        expected: 'Top 3: router_interface_metrics, device_performance_history, router_metrics. Tabel lain < 100MB.',
        level: 'info',
    },
    {
        title: 'Update Dependencies (Cek Security)',
        description: 'Cek npm audit sebulan sekali untuk CVE baru.',
        command: 'cd /opt/app && npm audit --production',
        expected: '0 critical. Moderate/low vulnerabilities boleh (review case-by-case).',
        troubleshoot: 'Kalau ada critical: `npm audit fix` (non-breaking) atau review manual. Jangan `--force` tanpa pengujian.',
        level: 'warning',
    },
];

const TROUBLESHOOTING = [
    {
        title: 'Redis "MISCONF" RDB Snapshot Error',
        description: 'BullMQ queue stuck, error "Redis is configured to save RDB snapshots, but it\'s currently unable to persist to disk". Biasanya disk penuh atau permission issue.',
        command: `# 1. Cek disk
df -h
# 2. Cek Redis data dir
ls -la /var/lib/redis/
sudo -u redis touch /var/lib/redis/test-write && rm /var/lib/redis/test-write
# 3. Quick fix sementara (supaya queue jalan lagi)
redis-cli CONFIG SET stop-writes-on-bgsave-error no
# 4. Fix root cause (disk/permission), restart redis
sudo systemctl restart redis-server`,
        level: 'critical',
    },
    {
        title: 'Backup Auto Tidak Jalan',
        description: 'Tidak ada file auto-bkp-* baru > 48 jam.',
        command: `# Cek log backup
pm2 logs monitoring-api --lines 500 --nostream | grep -iE "backup"
# Verifikasi pg_dump tersedia
pg_dump --version
# Manual backup sekarang
sudo -u postgres pg_dump mikrotik_monitor | gzip > /opt/app/backups/manual_$(date +%Y%m%d_%H%M%S).sql.gz`,
        troubleshoot: 'Kalau error syntax --compress: update ke commit terbaru (fix ada di pg_dump syntax). Kalau pg_dump not found: `apt install postgresql-client`',
        level: 'warning',
    },
    {
        title: 'ONU Hilang dari Map Setelah Sinkron OLT',
        description: 'ONU yang dihapus dari OLT otomatis di-mark Removed from OLT. Setelah 30 hari offline, archived (hilang dari map). Setelah 60 hari, hard-delete.',
        command: `# Cek ONU yang baru archived
sudo -u postgres psql -d mikrotik_monitor -c "SELECT name, host, status, archived_at FROM onus WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 20;"
# Restore manual (kalau salah archived)
sudo -u postgres psql -d mikrotik_monitor -c "UPDATE onus SET archived_at = NULL WHERE sn = 'SN_ONU_HERE';"`,
        level: 'info',
    },
    {
        title: 'Router Sync Gagal Berulang',
        description: 'Log penuh "Connection closed" atau "Username or password is invalid".',
        command: `# Cek credentials untuk router spesifik
sudo -u postgres psql -d mikrotik_monitor -c "SELECT name, host, port, username, use_snmp, status FROM routers;"
# Test koneksi MikroTik manual dari Proxmox
nc -zv <router_host> 8728
# Update password via UI: Devices → Edit Router → Update password`,
        troubleshoot: 'Kalau "Invalid credentials" di log: update password router di UI. Kalau "Connection closed" berulang: cek network ke host itu (ping, traceroute).',
        level: 'warning',
    },
    {
        title: 'Telegram Notifikasi Tidak Terkirim',
        description: 'Error "telegramError" di log. Biasanya thread_id salah atau bot belum di-add ke group.',
        command: `# Ambil bot token dari DB (jangan share!)
sudo -u postgres psql -d mikrotik_monitor -c "SELECT name, telegram_chat_id, telegram_thread_id FROM notification_groups;"
# Test bot dengan curl (ganti <TOKEN> dan <CHAT_ID>)
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<CHAT_ID>"`,
        troubleshoot: 'Error "message thread not found": isi telegram_thread_id di notification group. Error "Unauthorized": bot token invalid, generate baru via @BotFather.',
        level: 'info',
    },
    {
        title: 'Disk Hampir Penuh (> 85%)',
        description: 'Perlu action segera — kalau penuh 100%, PostgreSQL stop.',
        command: `# Identifikasi apa yang boros
sudo du -sh /var/lib/postgresql /var/lib/redis /opt/app/backups /var/log/* 2>/dev/null | sort -rh | head -10
# Cleanup quick wins
pm2 flush
sudo journalctl --vacuum-size=200M
find /opt/app/backups -name "auto-bkp-*" -mtime +14 -delete
# Compress lebih agresif (policy 3 hari, bukan 7)
sudo -u postgres psql -d mikrotik_monitor -c "SELECT remove_compression_policy('device_performance_history'); SELECT add_compression_policy('device_performance_history', INTERVAL '3 days');"`,
        level: 'critical',
    },
    {
        title: 'Halaman Aplikasi Lambat Loading',
        description: 'API response > 2 detik atau UI terasa sluggish.',
        command: `# Cek response time
for i in 1 2 3; do curl -s -o /dev/null -w "%{time_total}s\\n" http://localhost:3001/api/health; done
# Cek PostgreSQL slow query (butuh pg_stat_statements extension)
sudo -u postgres psql -d mikrotik_monitor -c "SELECT query, calls, total_exec_time, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;" 2>&1 | head -20
# Restart API kalau memory bocor
pm2 restart monitoring-api`,
        troubleshoot: 'Kalau API > 500ms: cek memory PM2 (`pm2 list`). Kalau > 800MB, restart. Kalau query lambat: pertimbangkan VACUUM ANALYZE.',
        level: 'warning',
    },
];

const REFERENCE = [
    {
        title: 'Retention Periods (Rekomendasi Saat Ini)',
        description: 'Interface traffic (TX/RX) dipertahankan 400 hari untuk trend 1+ tahun. Selain itu 60 hari cukup untuk operasional sehari-hari.',
        command: `-- Apply ke semua tenant
sudo -u postgres psql -d mikrotik_monitor <<'EOF'
UPDATE app_settings SET value = '400' WHERE key = 'interface_metrics_retention_days';
UPDATE app_settings SET value = '60'  WHERE key IN ('metrics_retention_days', 'performance_retention_days', 'pppoe_retention_days', 'alerts_retention_days');
UPDATE app_settings SET value = '90'  WHERE key = 'audit_logs_retention_days';
UPDATE app_settings SET value = '90'  WHERE key = 'backups_retention_days';
EOF`,
        level: 'info',
    },
    {
        title: 'TimescaleDB Compression Setup',
        description: 'Policy compress chunk > 7 hari. Pasang sekali, jalan otomatis setiap 12 jam.',
        command: `sudo -u postgres psql -d mikrotik_monitor <<'EOF'
-- Enable compression (per tabel — sekali saja)
ALTER TABLE router_interface_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'tenant_id, interface_id', timescaledb.compress_orderby = 'recorded_at DESC, id');
ALTER TABLE device_performance_history SET (timescaledb.compress, timescaledb.compress_segmentby = 'tenant_id, router_id', timescaledb.compress_orderby = 'recorded_at DESC');
ALTER TABLE router_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'tenant_id, router_id', timescaledb.compress_orderby = 'recorded_at DESC');
-- Policy (pasang — sekali saja)
SELECT add_compression_policy('router_interface_metrics', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('device_performance_history', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('router_metrics', INTERVAL '7 days', if_not_exists => TRUE);
EOF`,
        level: 'info',
    },
    {
        title: 'PM2 Log Rotation (Sudah Terpasang)',
        description: 'Rotasi harian, simpan 14 hari, max 50MB per file, di-gzip.',
        command: `pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'`,
        level: 'info',
    },
    {
        title: 'PM2 Auto-Startup on Reboot (Sudah Terpasang)',
        description: 'Kalau VM Proxmox reboot, PM2 otomatis restore semua processes.',
        command: `pm2 startup
# Copy-paste command systemctl yang muncul
pm2 save`,
        level: 'info',
    },
    {
        title: 'Deploy Update dari GitHub',
        description: 'Script ini handle: git pull, npm install, build, migration, repair, restart PM2.',
        command: 'cd /opt/app && ./scripts/update-server.sh',
        expected: 'Selesai dengan "✅ Update completed successfully!". Total waktu ~1-2 menit.',
        level: 'info',
    },
    {
        title: 'Lokasi File Penting',
        description: 'Referensi cepat struktur filesystem.',
        command: `/opt/app/                          # Source code (git-tracked)
/opt/app/backups/                   # Auto-backup *.sql.gz
/opt/app/apps/api/.env              # Config (jangan di-commit)
/root/.pm2/logs/                    # PM2 logs
/var/lib/postgresql/14/             # PostgreSQL data
/var/lib/redis/                     # Redis RDB dump
/var/log/redis/                     # Redis logs`,
        level: 'info',
    },
];
