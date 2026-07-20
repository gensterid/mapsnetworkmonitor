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
// Defensif: index non-numerik / rusak → fallback ke 'slate' (abu) supaya
// pemanggil (mis. `coreColor(i).hex`) tak pernah crash pada data tercemar.
export const coreColor = (i) => {
    const n = FIBER_COLORS.length;
    const num = Number(i);
    if (!Number.isFinite(num)) return FIBER_COLORS[4]; // 'slate'
    const idx = ((Math.trunc(num) - 1) % n + n) % n;
    return FIBER_COLORS[idx];
};

// Cari definisi warna dari key (mis. 'blue'). null bila key tak dikenal.
export const colorByKey = (key) => FIBER_COLORS.find((c) => c.key === key) || null;

// Warna EFEKTIF sebuah core: pakai warna tersimpan bila valid, kalau tidak
// jatuh ke standar TIA berdasarkan nomor core.
//
// Perlu karena satu ODP sering memakai BEBERAPA kabel 2-core ke arah berbeda,
// dan tiap kabel itu fisiknya sama-sama biru+oranye. Warna karena itu tak bisa
// lagi diturunkan dari nomor core saja (C3 tidak selalu hijau) — operator harus
// bisa menyetel C3=biru, C4=oranye untuk kabel arah kedua. Dipakai renderer
// peta, panel detail, dan modal supaya satu sumber kebenaran.
export const resolveCoreColor = (core) => colorByKey(core?.color) || coreColor(core?.i);

// Bangun array cores default untuk jumlah tertentu, mempertahankan warna/dest/
// note yang sudah ada saat resize.
export const buildCores = (count, existing = []) => {
    const out = [];
    for (let i = 1; i <= count; i++) {
        const prev = existing.find((c) => Number(c.i) === i);
        out.push({
            i,
            // Pertahankan warna pilihan operator saat jumlah core diubah —
            // hanya core baru yang memakai default TIA.
            color: prev?.color || coreColor(i).key,
            dest: prev?.dest || '',
            note: prev?.note || '',
        });
    }
    return out;
};
