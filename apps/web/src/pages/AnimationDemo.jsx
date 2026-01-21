import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import AnimatedPath from '../components/map/AnimatedPath';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Simple marker icon
const createIcon = (color) => L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

const AnimationDemo = () => {
    const [selectedStyle, setSelectedStyle] = useState('default');

    // Center position (can be adjusted)
    const center = [-6.2, 106.8];

    // Different animation styles
    const animationStyles = {
        // === BASIC STYLES ===
        default: {
            name: 'Default (Marching Ants)',
            delay: 800,
            dashArray: [10, 20],
            weight: 3,
            color: '#10b981',
            pulseColor: '#ffffff',
            description: 'Animasi standar dengan kecepatan sedang',
            category: 'basic'
        },
        fast: {
            name: 'Fast Flow',
            delay: 300,
            dashArray: [10, 20],
            weight: 3,
            color: '#3b82f6',
            pulseColor: '#93c5fd',
            description: 'Animasi cepat untuk menunjukkan traffic tinggi',
            category: 'basic'
        },
        slow: {
            name: 'Slow Pulse',
            delay: 1500,
            dashArray: [20, 10],
            weight: 4,
            color: '#8b5cf6',
            pulseColor: '#c4b5fd',
            description: 'Animasi lambat, lebih halus',
            category: 'basic'
        },
        dotted: {
            name: 'Dotted Stream',
            delay: 500,
            dashArray: [5, 15],
            weight: 4,
            color: '#f59e0b',
            pulseColor: '#fcd34d',
            description: 'Titik-titik kecil bergerak',
            category: 'basic'
        },
        longDash: {
            name: 'Long Dash',
            delay: 600,
            dashArray: [30, 10],
            weight: 3,
            color: '#ec4899',
            pulseColor: '#f9a8d4',
            description: 'Garis panjang dengan jarak pendek',
            category: 'basic'
        },
        heavy: {
            name: 'Heavy Traffic',
            delay: 400,
            dashArray: [15, 5],
            weight: 6,
            color: '#ef4444',
            pulseColor: '#fca5a5',
            description: 'Garis tebal untuk koneksi utama',
            category: 'basic'
        },
        thin: {
            name: 'Thin Connection',
            delay: 700,
            dashArray: [8, 12],
            weight: 2,
            color: '#64748b',
            pulseColor: '#94a3b8',
            description: 'Garis tipis untuk koneksi sekunder',
            category: 'basic'
        },
        zigzag: {
            name: 'Quick Burst',
            delay: 200,
            dashArray: [3, 8],
            weight: 3,
            color: '#06b6d4',
            pulseColor: '#67e8f9',
            description: 'Titik-titik sangat cepat',
            category: 'basic'
        },

        // === SPECIAL STYLES ===
        fiberOptic: {
            name: '🔮 Fiber Optic',
            delay: 150,
            dashArray: [2, 4],
            weight: 3,
            color: '#00ff88',
            pulseColor: '#00ffcc',
            description: 'Efek serat optik super cepat',
            category: 'special'
        },
        electricPulse: {
            name: '⚡ Electric Pulse',
            delay: 100,
            dashArray: [4, 12, 2, 12],
            weight: 4,
            color: '#ffee00',
            pulseColor: '#ffffff',
            description: 'Efek listrik dengan pola tidak beraturan',
            category: 'special'
        },
        neonGlow: {
            name: '💜 Neon Glow',
            delay: 600,
            dashArray: [15, 8],
            weight: 5,
            color: '#ff00ff',
            pulseColor: '#ff88ff',
            description: 'Efek neon bercahaya',
            category: 'special'
        },
        dataStream: {
            name: '📊 Data Stream',
            delay: 250,
            dashArray: [1, 3],
            weight: 2,
            color: '#00ccff',
            pulseColor: '#88eeff',
            description: 'Aliran data digital seperti binary',
            category: 'special'
        },
        rainbowFlow: {
            name: '🌈 Rainbow Flow',
            delay: 400,
            dashArray: [8, 6],
            weight: 4,
            color: '#ff6b6b',
            pulseColor: '#4ecdc4',
            description: 'Efek gradien warna-warni',
            category: 'special'
        },
        laserBeam: {
            name: '🔴 Laser Beam',
            delay: 50,
            dashArray: [40, 5],
            weight: 2,
            color: '#ff0000',
            pulseColor: '#ff6666',
            description: 'Garis laser super cepat',
            category: 'special'
        },
        heartbeat: {
            name: '💓 Heartbeat',
            delay: 800,
            dashArray: [3, 8, 15, 8],
            weight: 4,
            color: '#ff4757',
            pulseColor: '#ff7f8a',
            description: 'Pola detak jantung untuk monitoring kesehatan',
            category: 'special'
        },
        matrixStyle: {
            name: '🖥️ Matrix Code',
            delay: 180,
            dashArray: [2, 6, 4, 6],
            weight: 3,
            color: '#00ff00',
            pulseColor: '#00aa00',
            description: 'Efek Matrix dengan aliran kode',
            category: 'special'
        },
        waveFlow: {
            name: '🌊 Wave Flow',
            delay: 700,
            dashArray: [12, 4, 6, 4],
            weight: 5,
            color: '#0099ff',
            pulseColor: '#66ccff',
            description: 'Efek gelombang mengalir',
            category: 'special'
        },
        fireTrail: {
            name: '🔥 Fire Trail',
            delay: 300,
            dashArray: [10, 3, 5, 3],
            weight: 4,
            color: '#ff6600',
            pulseColor: '#ffcc00',
            description: 'Jejak api bergerak',
            category: 'special'
        },
        iceFlow: {
            name: '❄️ Ice Flow',
            delay: 900,
            dashArray: [8, 15],
            weight: 3,
            color: '#88ddff',
            pulseColor: '#ffffff',
            description: 'Aliran dingin lambat seperti es',
            category: 'special'
        },
        particleStream: {
            name: '✨ Particle Stream',
            delay: 120,
            dashArray: [1, 8],
            weight: 3,
            color: '#ffdd00',
            pulseColor: '#ffffff',
            description: 'Partikel-partikel bercahaya',
            category: 'special'
        },
    };

    // Demo paths - different positions for each style
    const allKeys = Object.keys(animationStyles);
    const paths = {};
    allKeys.forEach((key, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        const startLat = -6.16 - (row * 0.025);
        const startLng = 106.74 + (col * 0.035);
        paths[key] = [
            [startLat, startLng],
            [startLat - 0.008, startLng + 0.015],
            [startLat - 0.015, startLng + 0.03]
        ];
    });

    const currentStyle = animationStyles[selectedStyle];

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-2">🎨 Demo Animasi Garis Map</h1>
                <p className="text-gray-400 mb-6">Klik pada style untuk melihat preview animasi</p>

                {/* Basic Styles */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3 text-gray-300">📦 Basic Styles</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(animationStyles)
                            .filter(([, style]) => style.category === 'basic')
                            .map(([key, style]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedStyle(key)}
                                    className={`p-3 rounded-xl text-left transition-all ${selectedStyle === key
                                        ? 'bg-emerald-600 ring-2 ring-emerald-400'
                                        : 'bg-gray-800 hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div
                                            className="w-8 h-1 rounded-full"
                                            style={{ backgroundColor: style.color }}
                                        />
                                        <span className="font-semibold text-sm">{style.name}</span>
                                    </div>
                                    <p className="text-xs text-gray-400">{style.description}</p>
                                </button>
                            ))}
                    </div>
                </div>

                {/* Special Styles */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-3 text-purple-400">✨ Special Styles</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(animationStyles)
                            .filter(([, style]) => style.category === 'special')
                            .map(([key, style]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedStyle(key)}
                                    className={`p-3 rounded-xl text-left transition-all ${selectedStyle === key
                                        ? 'bg-purple-600 ring-2 ring-purple-400'
                                        : 'bg-gray-800/80 hover:bg-gray-700 border border-purple-500/30'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div
                                            className="w-8 h-1 rounded-full"
                                            style={{
                                                backgroundColor: style.color,
                                                boxShadow: `0 0 8px ${style.color}`
                                            }}
                                        />
                                        <span className="font-semibold text-sm">{style.name}</span>
                                    </div>
                                    <p className="text-xs text-gray-400">{style.description}</p>
                                </button>
                            ))}
                    </div>
                </div>

                {/* Current Style Details */}
                <div className="bg-gray-800 rounded-xl p-6 mb-6">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: currentStyle.color }}></span>
                        {currentStyle.name}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-gray-700 rounded-lg p-3">
                            <span className="text-gray-400 text-xs">Delay</span>
                            <p className="text-lg font-mono">{currentStyle.delay}ms</p>
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                            <span className="text-gray-400 text-xs">Dash Array</span>
                            <p className="text-lg font-mono">[{currentStyle.dashArray.join(', ')}]</p>
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                            <span className="text-gray-400 text-xs">Weight</span>
                            <p className="text-lg font-mono">{currentStyle.weight}px</p>
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                            <span className="text-gray-400 text-xs">Color</span>
                            <p className="text-lg font-mono flex items-center gap-2">
                                <span className="w-4 h-4 rounded" style={{ backgroundColor: currentStyle.color }}></span>
                                {currentStyle.color}
                            </p>
                        </div>
                        <div className="bg-gray-700 rounded-lg p-3">
                            <span className="text-gray-400 text-xs">Pulse Color</span>
                            <p className="text-lg font-mono flex items-center gap-2">
                                <span className="w-4 h-4 rounded" style={{ backgroundColor: currentStyle.pulseColor }}></span>
                                {currentStyle.pulseColor}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Map Preview */}
                <div className="bg-gray-800 rounded-xl overflow-hidden" style={{ height: '500px' }}>
                    <MapContainer
                        center={center}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                        className="rounded-xl"
                    >
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />

                        {/* Show all animation styles */}
                        {Object.entries(animationStyles).map(([key, style]) => (
                            <React.Fragment key={key}>
                                <AnimatedPath
                                    positions={paths[key]}
                                    color={style.color}
                                    pulseColor={style.pulseColor}
                                    weight={selectedStyle === key ? style.weight + 2 : style.weight}
                                    opacity={selectedStyle === key ? 1 : 0.5}
                                    delay={style.delay}
                                    dashArray={style.dashArray}
                                    tooltip={style.name}
                                />
                                {/* Start marker */}
                                <Marker
                                    position={paths[key][0]}
                                    icon={createIcon(style.color)}
                                />
                                {/* End marker */}
                                <Marker
                                    position={paths[key][paths[key].length - 1]}
                                    icon={createIcon(style.pulseColor)}
                                />
                            </React.Fragment>
                        ))}
                    </MapContainer>
                </div>

                {/* Code Example */}
                <div className="bg-gray-800 rounded-xl p-6 mt-6">
                    <h2 className="text-xl font-bold mb-4">📝 Contoh Kode:</h2>
                    <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-green-400">
                            {`<AnimatedPath
    positions={[
        [-6.18, 106.75],
        [-6.17, 106.78],
        [-6.16, 106.82]
    ]}
    color="${currentStyle.color}"
    pulseColor="${currentStyle.pulseColor}"
    weight={${currentStyle.weight}}
    delay={${currentStyle.delay}}
    dashArray={[${currentStyle.dashArray.join(', ')}]}
    tooltip="${currentStyle.name}"
/>`}
                        </code>
                    </pre>
                </div>

                {/* Parameter Reference */}
                <div className="bg-gray-800 rounded-xl p-6 mt-6">
                    <h2 className="text-xl font-bold mb-4">📚 Referensi Parameter:</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-4">Parameter</th>
                                    <th className="py-2 px-4">Tipe</th>
                                    <th className="py-2 px-4">Default</th>
                                    <th className="py-2 px-4">Deskripsi</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">delay</td>
                                    <td className="py-2 px-4">number</td>
                                    <td className="py-2 px-4">800</td>
                                    <td className="py-2 px-4">Kecepatan animasi dalam milidetik</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">dashArray</td>
                                    <td className="py-2 px-4">[number, number]</td>
                                    <td className="py-2 px-4">[10, 20]</td>
                                    <td className="py-2 px-4">Pola: [panjang_dash, jarak]</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">weight</td>
                                    <td className="py-2 px-4">number</td>
                                    <td className="py-2 px-4">3</td>
                                    <td className="py-2 px-4">Ketebalan garis dalam pixel</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">color</td>
                                    <td className="py-2 px-4">string</td>
                                    <td className="py-2 px-4">#10b981</td>
                                    <td className="py-2 px-4">Warna garis utama</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">pulseColor</td>
                                    <td className="py-2 px-4">string</td>
                                    <td className="py-2 px-4">#ffffff</td>
                                    <td className="py-2 px-4">Warna animasi pulse</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">reverse</td>
                                    <td className="py-2 px-4">boolean</td>
                                    <td className="py-2 px-4">false</td>
                                    <td className="py-2 px-4">Membalik arah animasi</td>
                                </tr>
                                <tr className="border-b border-gray-700/50">
                                    <td className="py-2 px-4 font-mono text-cyan-400">paused</td>
                                    <td className="py-2 px-4">boolean</td>
                                    <td className="py-2 px-4">false</td>
                                    <td className="py-2 px-4">Menghentikan animasi sementara</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnimationDemo;
