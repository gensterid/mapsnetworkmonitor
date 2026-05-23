import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRouterNetwatch } from '@/hooks';

const TOOL_LABELS = { ping: 'Ping', traceroute: 'Traceroute', portcheck: 'Port Check' };

function HostInput({ value, onChange, netwatchHosts, placeholder }) {
    return (
        <div style={{ position: 'relative', flex: 1 }}>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder || 'IP address or hostname'}
                list="tools-host-list"
                style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(15,23,42,0.7)', color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                }}
            />
            {netwatchHosts.length > 0 && (
                <datalist id="tools-host-list">
                    {netwatchHosts.map(h => <option key={h.host} value={h.host}>{h.name ? `${h.host} (${h.name})` : h.host}</option>)}
                </datalist>
            )}
        </div>
    );
}

function PingResult({ data }) {
    if (!data) return null;
    const { host, latency, packetLoss, success } = data;
    return (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(15,23,42,0.8)', border: `1px solid ${success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>PING</span>
                <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 13 }}>{host}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: success ? '#10b981' : '#ef4444' }}>
                    {success ? '✓ Reachable' : '✗ Unreachable'}
                </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
                <div>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Latency</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: success ? '#34d399' : '#ef4444' }}>
                        {latency != null && latency >= 0 ? `${latency}ms` : '—'}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Packet Loss</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: packetLoss > 0 ? '#f59e0b' : '#34d399' }}>
                        {packetLoss != null ? `${packetLoss}%` : '—'}
                    </div>
                </div>
            </div>
        </div>
    );
}

function TracerouteResult({ data }) {
    if (!data?.hops?.length) return (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: 12 }}>
            No hops returned. Router may not support traceroute or destination unreachable.
        </div>
    );
    return (
        <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                    <tr style={{ background: 'rgba(15,23,42,0.9)' }}>
                        {['Hop', 'Address', 'Latency', 'Loss'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.hops.map((hop, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(15,23,42,0.5)' : 'rgba(15,23,42,0.3)' }}>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#64748b' }}>{hop.hop}</td>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: hop.address === '*' ? '#475569' : '#94a3b8' }}>{hop.address}</td>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: hop.latency != null ? '#34d399' : '#475569' }}>
                                {hop.latency != null ? `${hop.latency.toFixed(1)}ms` : '*'}
                            </td>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: hop.loss > 0 ? '#f59e0b' : '#34d399' }}>
                                {hop.loss != null ? `${hop.loss}%` : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PortCheckResult({ data }) {
    if (!data) return null;
    const { host, port, open, latency } = data;
    return (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(15,23,42,0.8)', border: `1px solid ${open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>PORT CHECK</span>
                <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 13 }}>{host}:{port}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: open ? '#10b981' : '#ef4444' }}>
                    {open ? `OPEN  ${latency}ms` : 'CLOSED / FILTERED'}
                </span>
            </div>
        </div>
    );
}

export default function ToolsTab({ routerId }) {
    const [tool, setTool] = useState('ping');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('80');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const { data: netwatchData } = useRouterNetwatch(routerId);
    const netwatchHosts = (Array.isArray(netwatchData) ? netwatchData : [])
        .filter(e => e.host && e.host !== '0.0.0.0')
        .map(e => ({ host: e.host, name: e.name }));

    const pingMutation = useMutation({
        mutationFn: ({ host }) => apiClient.post(`/routers/${routerId}/tools/ping`, { host, count: 4 }).then(r => r.data.data),
        onSuccess: data => { setResult({ type: 'ping', data }); setError(null); },
        onError: err => setError(err.response?.data?.error || err.message),
    });

    const traceMutation = useMutation({
        mutationFn: ({ host }) => apiClient.post(`/routers/${routerId}/tools/traceroute`, { host }).then(r => r.data.data),
        onSuccess: data => { setResult({ type: 'traceroute', data }); setError(null); },
        onError: err => setError(err.response?.data?.error || err.message),
    });

    const portMutation = useMutation({
        mutationFn: ({ host, port }) => apiClient.post(`/routers/${routerId}/tools/port-check`, { host, port: parseInt(port) }).then(r => r.data.data),
        onSuccess: data => { setResult({ type: 'portcheck', data }); setError(null); },
        onError: err => setError(err.response?.data?.error || err.message),
    });

    const isRunning = pingMutation.isPending || traceMutation.isPending || portMutation.isPending;

    const handleRun = () => {
        if (!host.trim()) return;
        setResult(null);
        setError(null);
        if (tool === 'ping') pingMutation.mutate({ host: host.trim() });
        else if (tool === 'traceroute') traceMutation.mutate({ host: host.trim() });
        else if (tool === 'portcheck') portMutation.mutate({ host: host.trim(), port });
    };

    return (
        <div style={{ padding: '16px', color: '#e2e8f0' }}>
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>Tool</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {Object.entries(TOOL_LABELS).map(([id, label]) => (
                        <button key={id} onClick={() => { setTool(id); setResult(null); setError(null); }} style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                            background: tool === id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                            color: tool === id ? '#60a5fa' : '#94a3b8',
                            outline: tool === id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                        }}>{label}</button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>Target</div>
                    <HostInput value={host} onChange={setHost} netwatchHosts={netwatchHosts} />
                </div>
                {tool === 'portcheck' && (
                    <div style={{ width: 80 }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>Port</div>
                        <input
                            type="number" value={port} onChange={e => setPort(e.target.value)}
                            min="1" max="65535"
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15,23,42,0.7)', color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                )}
                <button
                    onClick={handleRun}
                    disabled={isRunning || !host.trim()}
                    style={{
                        padding: '7px 18px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: isRunning || !host.trim() ? 'not-allowed' : 'pointer',
                        background: isRunning ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.7)',
                        color: isRunning ? '#60a5fa' : '#ffffff', opacity: !host.trim() ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    {isRunning ? (
                        <><span className="material-symbols-outlined" style={{ fontSize: 15, animation: 'spin 1s linear infinite' }}>sync</span> Running...</>
                    ) : (
                        <><span className="material-symbols-outlined" style={{ fontSize: 15 }}>play_arrow</span> Run</>
                    )}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>
                    {error}
                </div>
            )}

            {result?.type === 'ping' && <PingResult data={result.data} />}
            {result?.type === 'traceroute' && <TracerouteResult data={result.data} />}
            {result?.type === 'portcheck' && <PortCheckResult data={result.data} />}

            {!result && !error && !isRunning && (
                <div style={{ marginTop: 20, color: '#334155', fontSize: 12, textAlign: 'center' }}>
                    Masukkan IP atau hostname lalu klik Run
                </div>
            )}
        </div>
    );
}
