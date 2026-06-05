import { useContext } from 'react';
import { MikhmonContext } from './MikhmonContext.jsx';

export function useMikhmonContext() {
    const ctx = useContext(MikhmonContext);
    if (!ctx) throw new Error('useMikhmonContext must be used inside <MikhmonProvider>');
    return ctx;
}
