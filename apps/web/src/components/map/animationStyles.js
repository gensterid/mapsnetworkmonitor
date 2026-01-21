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
        description: 'Animasi standar dengan aliran smooth'
    },

    // Fast pulse - quick data flow visualization
    fastPulse: {
        name: 'Fast Pulse',
        delay: 300,
        dashArray: [5, 10],
        weight: 3,
        description: 'Animasi cepat untuk visualisasi data flow tinggi'
    },

    // Slow wave - gentle, relaxed animation
    slowWave: {
        name: 'Slow Wave',
        delay: 1500,
        dashArray: [15, 30],
        weight: 4,
        description: 'Animasi lambat dan santai'
    },

    // Dotted - small dots moving along the line
    dotted: {
        name: 'Dotted',
        delay: 400,
        dashArray: [3, 12],
        weight: 4,
        description: 'Titik-titik kecil bergerak di sepanjang garis'
    },

    // Dashed - longer dashes with gaps
    dashed: {
        name: 'Dashed',
        delay: 600,
        dashArray: [20, 15],
        weight: 3,
        description: 'Garis putus-putus panjang'
    },

    // Racing - very fast, thin lines
    racing: {
        name: 'Racing',
        delay: 150,
        dashArray: [8, 16],
        weight: 2,
        description: 'Animasi sangat cepat seperti balap'
    },

    // Thick flow - heavy data visualization
    thickFlow: {
        name: 'Thick Flow',
        delay: 500,
        dashArray: [12, 8],
        weight: 5,
        description: 'Garis tebal untuk visualisasi bandwidth besar'
    },

    // Morse - dash-dot pattern
    morse: {
        name: 'Morse Code',
        delay: 400,
        dashArray: [15, 5, 5, 5],
        weight: 3,
        description: 'Pola seperti kode morse'
    },

    // Heartbeat - irregular pulse pattern
    heartbeat: {
        name: 'Heartbeat',
        delay: 350,
        dashArray: [5, 5, 15, 5],
        weight: 3,
        description: 'Pola seperti detak jantung'
    },

    // Fiber optic - very thin, fast animation
    fiberOptic: {
        name: 'Fiber Optic',
        delay: 100,
        dashArray: [2, 8],
        weight: 2,
        description: 'Simulasi sinyal fiber optic super cepat'
    },

    // Static - no animation (paused)
    static: {
        name: 'Static (No Animation)',
        delay: 800,
        dashArray: [10, 20],
        weight: 3,
        paused: true,
        description: 'Garis statis tanpa animasi'
    },

    // Reverse flow - data flowing backwards
    reverseFlow: {
        name: 'Reverse Flow',
        delay: 600,
        dashArray: [10, 20],
        weight: 3,
        reverse: true,
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
        description: 'Animasi minimal dan profesional'
    },
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
