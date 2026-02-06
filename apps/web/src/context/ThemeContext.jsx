import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const THEMES = {
    DEFAULT: 'default',
    CYBERPUNK: 'theme-cyberpunk',
    EMERALD: 'theme-emerald',
    ARCTIC: 'theme-arctic',
    SLATE: 'theme-slate'
};

export const THEME_DETAILS = {
    [THEMES.DEFAULT]: { name: 'Midnight Glow', color: '#3B82F6' },
    [THEMES.CYBERPUNK]: { name: 'Cyberpunk Neon', color: '#06b6d4' },
    [THEMES.EMERALD]: { name: 'Emerald Forest', color: '#10b981' },
    [THEMES.ARCTIC]: { name: 'Arctic Frost', color: '#38bdf8' },
    [THEMES.SLATE]: { name: 'Professional Slate', color: '#94a3b8' }
};

export function ThemeProvider({ children }) {
    // Read from localStorage or default
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('app-theme');
        // Validate if saved theme is still valid
        return Object.values(THEMES).includes(saved) ? saved : THEMES.DEFAULT;
    });

    useEffect(() => {
        // Remove old theme classes
        const root = document.documentElement;
        Object.values(THEMES).forEach(t => {
            if (t !== THEMES.DEFAULT) root.classList.remove(t);
        });

        // Add new theme class (if not default)
        if (theme !== THEMES.DEFAULT) {
            root.classList.add(theme);
        }

        // Save to storage
        localStorage.setItem('app-theme', theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, themeDetails: THEME_DETAILS }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
