/**
 * Animation style presets for map connection lines
 * These can be selected from settings or per-connection
 */

export const ANIMATION_STYLES = {
    // Default - smooth flowing animation
    default: {
        name: 'Default',
        delay: 800,
        dashArray: [10, 20],
        weight: 3,
        isAntPath: false, // Use stable AntPath renderer
        pulseColor: 'transparent',
        description: 'Animasi standar dengan aliran smooth'
    },

    // Fast pulse - quick data flow visualization
    fastPulse: {
        name: 'Fast Pulse',
        delay: 300,
        dashArray: [5, 10],
        weight: 3,
        isAntPath: false,
        pulseColor: 'transparent',
        description: 'Animasi cepat untuk visualisasi data flow tinggi'
    },

    // Slow wave - gentle, relaxed animation
    slowWave: {
        name: 'Slow Wave',
        delay: 1500,
        dashArray: [15, 30],
        weight: 4,
        pulseColor: 'transparent',
        description: 'Animasi lambat dan santai'
    },

    // Dotted - small dots moving along the line
    dotted: {
        name: 'Dotted',
        delay: 400,
        dashArray: [3, 12],
        weight: 4,
        isAntPath: false, // Use stable AntPath renderer
        pulseColor: 'transparent',
        description: 'Titik-titik kecil bergerak di sepanjang garis'
    },

    // Dashed - longer dashes with gaps
    dashed: {
        name: 'Dashed',
        delay: 600,
        dashArray: [20, 15],
        weight: 3,
        pulseColor: 'transparent',
        description: 'Garis putus-putus panjang'
    },

    // Racing - very fast, thin lines
    racing: {
        name: 'Racing',
        delay: 150,
        dashArray: [8, 16],
        weight: 2,
        pulseColor: 'transparent',
        description: 'Animasi sangat cepat seperti balap'
    },

    // Thick flow - heavy data visualization
    thickFlow: {
        name: 'Thick Flow',
        delay: 500,
        dashArray: [12, 8],
        weight: 5,
        pulseColor: 'transparent',
        description: 'Garis tebal untuk visualisasi bandwidth besar'
    },

    // Morse - dash-dot pattern
    morse: {
        name: 'Morse Code',
        delay: 400,
        dashArray: [15, 5, 5, 5],
        weight: 3,
        pulseColor: 'transparent',
        description: 'Pola seperti kode morse'
    },

    // Heartbeat - irregular pulse pattern
    heartbeat: {
        name: 'Heartbeat',
        delay: 350,
        dashArray: [5, 5, 15, 5],
        weight: 3,
        pulseColor: 'transparent',
        description: 'Pola seperti detak jantung'
    },

    // Fiber optic - very thin, fast animation
    fiberOptic: {
        name: 'Fiber Optic',
        delay: 100,
        dashArray: [2, 8],
        weight: 2,
        pulseColor: 'transparent',
        description: 'Simulasi sinyal fiber optic super cepat'
    },

    // Static - no animation (paused)
    static: {
        name: 'Static (No Animation)',
        delay: 800,
        dashArray: [10, 20],
        weight: 3,
        paused: true,
        pulseColor: 'transparent',
        description: 'Garis statis tanpa animasi'
    },

    // Reverse flow - data flowing backwards
    reverseFlow: {
        name: 'Reverse Flow',
        delay: 600,
        dashArray: [10, 20],
        weight: 3,
        reverse: true,
        pulseColor: 'transparent',
        description: 'Animasi mengalir ke arah sebaliknya'
    },

    // Neon glow effect (thicker with higher opacity)
    neonGlow: {
        name: 'Neon Glow',
        delay: 500,
        dashArray: [15, 10],
        weight: 6,
        opacity: 0.9,
        description: 'Efek neon terang bercahaya'
    },

    // Subtle - minimal, professional look
    subtle: {
        name: 'Subtle',
        delay: 1200,
        dashArray: [8, 25],
        weight: 2,
        opacity: 0.5,
        pulseColor: 'transparent',
        description: 'Animasi minimal dan profesional'
    },

    // CyberFlow - Sleek, high-speed gradient effect
    cyberFlow: {
        name: 'CyberFlow (Premium)',
        delay: 200,
        dashArray: [20, 5, 20, 5],
        weight: 3,
        opacity: 0.9,
        className: 'cyber-flow-glow',
        description: 'Efek aliran siber berkecepatan tinggi'
    },

    // PulseWave - Irregular glowing pulses
    pulseWave: {
        name: 'PulseWave (Premium)',
        delay: 400,
        dashArray: [2, 10, 30, 10],
        weight: 4,
        opacity: 0.8,
        className: 'pulse-wave-glow',
        description: 'Denyut pulsa tidak beraturan'
    },

    // Plasma - Shifting core color effect
    plasma: {
        name: 'Plasma Beam',
        delay: 300,
        dashArray: [40, 10],
        weight: 8,
        opacity: 0.7,
        className: 'plasma-beam-glow',
        description: 'Efek balok plasma tebal dan bercahaya'
    },

    // Ghost - Low opacity, fast moving spirits
    ghost: {
        name: 'Ghost Signal',
        delay: 150,
        dashArray: [1, 50],
        weight: 3,
        opacity: 0.4,
        className: 'ghost-signal-blur',
        description: 'Sinyal transparan yang bergerak sangat cepat'
    },

    // Packet Flow (Exact Match for Reference)
    packetFlow: {
        name: 'Packet Data (Capsules)',
        delay: 600, // Slower for distinct packet visibility
        dashArray: [14, 120], // Long gap to create "discrete packet" look
        weight: 4,
        opacity: 1, // High opacity for the packet itself
        className: 'packet-flow-glow',
        lineCap: 'round', // Ensure rounds
        description: 'Visualisasi paket data berbentuk kapsul yang bergerak'
    },

    // Particle Dots (True Circles)
    particleDots: {
        name: 'Particle Dots (Tik-Tok Style)',
        delay: 800, // Slower movement
        dashArray: [4, 60], // 4px dot, 60px gap (Spaced out like video)
        weight: 6,
        opacity: 1,
        hardwareAccelerated: false, // Force false to ensure animation loop runs on all browsers
        className: 'particle-dots-glow',
        lineCap: 'round', // IMPORTANT: Round dots
        paused: false,
        description: 'Titik-titik cahaya bulat yang mengalir (Lambat & Terang)'
    },

    // --- Styles Inspired by User Request (NEON REFINED) ---

    // 1. Classic Pulse
    classicPulse: {
        name: 'Classic Single Pulse',
        delay: 4000,
        dashArray: [4, 1000],
        weight: 4,
        className: 'neon-pulse',
        lineCap: 'round',
        syncArrival: true, // Flag for constant-time travel across path
        description: 'Satu titik cahaya fokus (Bulat)'
    },

    // 2. Comet Tail
    cometTail: {
        name: 'Comet Tail (Meteor)',
        delay: 3000,
        dashArray: [50, 800],
        weight: 5,
        opacity: 0.9,
        className: 'neon-comet',
        lineCap: 'round',
        syncArrival: true,
        description: 'Ekor komet memanjang'
    },

    // 3. Multi-Burst
    multiBurst: {
        name: 'Multi-Burst (Packet)',
        delay: 4000,
        dashArray: [5, 40, 5, 40, 5, 800],
        weight: 4,
        className: 'neon-burst',
        lineCap: 'round',
        syncArrival: true,
        description: 'Paket data beruntun'
    },

    // 4. Warning / Slow Motion
    slowWarning: {
        name: 'Warning / Slow Motion',
        delay: 6000,
        dashArray: [10, 800],
        weight: 4,
        className: 'neon-warning',
        lineCap: 'round',
        syncArrival: true,
        description: 'Gerakan lambat indikator warning'
    },

    // Ant Path (Leaflet Plugin)
    antPath: {
        name: 'Ant Path (Marching Ants)',
        delay: 1000,
        dashArray: [10, 20],
        weight: 3,
        isAntPath: true, // Flag to identify this special renderer
        pulseColor: 'transparent',
        description: 'Efek garis berjalan klasik (Marching Ants)'
    },

    // --- NEW MOTION PATH STYLES ---

    // Glowing Orb (Motion Path)
    glowingOrb: {
        name: 'Glowing Orb (Motion)',
        delay: 3000,
        weight: 2,
        opacity: 0.3, // Dim background line
        useMotionPath: true, // Flag for new renderer
        motionType: 'orb',
        description: 'Bola kemilau terfokus (Circle) bergerak di atas jalur'
    },

    // Meteor / Comet (Motion Path)
    meteor: {
        name: 'Meteor (Motion)',
        delay: 1500, /* Faster for sense of energy */
        weight: 2,
        opacity: 0.3,
        useMotionPath: true,
        motionType: 'comet',
        description: 'Kilatan cahaya panjang (Streak) yang meluncur cepat'
    },

    // Data Packet (Motion Path)
    dataPacket: {
        name: 'Data Packet (Motion)',
        delay: 4500, /* Slower, more rhythmic */
        weight: 2,
        opacity: 0.4,
        useMotionPath: true,
        motionType: 'packet',
        description: 'Paket data berbentuk kapsul (Pill) yang bergerak teratur'
    }
};

// Get style by name with fallback to default
export function getAnimationStyle(styleName) {
    return ANIMATION_STYLES[styleName] || ANIMATION_STYLES.default;
}

// Get all style names for dropdown/selector
export function getAnimationStyleNames() {
    return Object.keys(ANIMATION_STYLES).map(key => ({
        value: key,
        label: ANIMATION_STYLES[key].name,
        description: ANIMATION_STYLES[key].description
    }));
}

export default ANIMATION_STYLES;
