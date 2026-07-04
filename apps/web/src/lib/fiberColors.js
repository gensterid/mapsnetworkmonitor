// Standar warna core fiber TIA-598-C (urutan 1..12). Untuk kabel >12 core,
// warna berulang (biasanya dengan penanda ring/strip, tapi kita ulang warna).
export const FIBER_COLORS = [
    { key: 'blue', name: 'Biru', hex: '#2563eb' },
    { key: 'orange', name: 'Oranye', hex: '#f97316' },
    { key: 'green', name: 'Hijau', hex: '#16a34a' },
    { key: 'brown', name: 'Coklat', hex: '#92400e' },
    { key: 'slate', name: 'Abu', hex: '#64748b' },
    { key: 'white', name: 'Putih', hex: '#e5e7eb' },
    { key: 'red', name: 'Merah', hex: '#dc2626' },
    { key: 'black', name: 'Hitam', hex: '#111827' },
    { key: 'yellow', name: 'Kuning', hex: '#eab308' },
    { key: 'violet', name: 'Ungu', hex: '#7c3aed' },
    { key: 'rose', name: 'Pink', hex: '#ec4899' },
    { key: 'aqua', name: 'Aqua', hex: '#06b6d4' },
];

// Pilihan jumlah core umum.
export const CORE_COUNTS = [2, 4, 6, 8, 12, 16, 24];

// Warna standar untuk core ke-i (1-based). Berulang setelah 12.
export const coreColor = (i) => {
    const n = FIBER_COLORS.length;
    const idx = ((Number(i) - 1) % n + n) % n;
    return FIBER_COLORS[idx];
};

// Bangun array cores default untuk jumlah tertentu, mempertahankan dest/note
// yang sudah ada saat resize.
export const buildCores = (count, existing = []) => {
    const out = [];
    for (let i = 1; i <= count; i++) {
        const prev = existing.find((c) => Number(c.i) === i);
        out.push({ i, color: coreColor(i).key, dest: prev?.dest || '', note: prev?.note || '' });
    }
    return out;
};
