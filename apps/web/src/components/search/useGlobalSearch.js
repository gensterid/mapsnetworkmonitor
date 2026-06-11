import { useEffect, useCallback, useState } from 'react';

/**
 * Global keyboard shortcut hook untuk Cmd+K / Ctrl+K.
 *
 * Cross-platform:
 *   - Mac: Cmd+K (metaKey)
 *   - Linux/Windows: Ctrl+K (ctrlKey)
 *
 * Plus Esc untuk close kalau modal open.
 *
 * Hindari trigger saat user lagi ngetik di input/textarea — kecuali
 * user emang explicit press shortcut (kita allow karena niat-nya
 * pasti mau search).
 *
 * Note: shortcut DAFAR digunakan di banyak app modern (Notion,
 * Linear, GitHub, dst) — operator familiar dengan pattern ini.
 */
export function useGlobalSearchShortcut() {
    const [isOpen, setIsOpen] = useState(false);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((v) => !v), []);

    useEffect(() => {
        const handler = (e) => {
            // Cmd+K (Mac) atau Ctrl+K (Linux/Win)
            const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
            if (isShortcut) {
                e.preventDefault();
                toggle();
                return;
            }

            // Esc tutup modal (handled internally di modal juga, tapi
            // jaga-jaga kalau focus bocor di luar input)
            if (e.key === 'Escape' && isOpen) {
                close();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, toggle, close]);

    return { isOpen, open, close, toggle };
}
