/**
 * SHMSThemeSwitcher.tsx — Theme switcher with 6 SOTA structural variations
 *
 * Changes the entire app structure with one click:
 *   - Layout grid (sidebar position, visibility)
 *   - Card styles (rounded, flat, borderless, floating)
 *   - Typography (sans-serif vs serif)
 *   - Color palette (dark, light, warm, neon, paper, OLED)
 *   - Navigation pattern (left, right, top, bottom dock, hidden)
 */

import { useState, useEffect, useCallback } from 'react';

export type ShmsTheme = 'precision-zen' | 'arctic' | 'copper' | 'neon-grid' | 'paper' | 'obsidian';

interface ThemeInfo {
  id: ShmsTheme;
  label: string;
  description: string;
  swatchColor: string;
  swatchBorder: string;
}

const THEMES: ThemeInfo[] = [
  { id: 'precision-zen', label: 'Precision Zen', description: 'Dark oklch, left sidebar, glassmorphism', swatchColor: 'oklch(11% 0.015 230)', swatchBorder: 'oklch(68% 0.16 240)' },
  { id: 'arctic',        label: 'Arctic',        description: 'Light mode, top nav, rounded cards, frost', swatchColor: 'oklch(97% 0.005 230)', swatchBorder: 'oklch(50% 0.18 240)' },
  { id: 'copper',        label: 'Copper',         description: 'Warm, right sidebar, industrial flat cards', swatchColor: 'oklch(13% 0.025 50)', swatchBorder: 'oklch(72% 0.15 55)' },
  { id: 'neon-grid',     label: 'Neon Grid',      description: 'Cyberpunk, icon sidebar, glow cards, grid bg', swatchColor: 'oklch(2% 0.005 280)', swatchBorder: 'oklch(78% 0.22 175)' },
  { id: 'paper',         label: 'Paper',          description: 'Tufte serif, no sidebar, tabbed nav, zero chrome', swatchColor: 'oklch(96% 0.003 80)', swatchBorder: 'oklch(12% 0.008 80)' },
  { id: 'obsidian',      label: 'Obsidian',       description: 'OLED black, bottom dock, floating panels', swatchColor: 'oklch(0% 0 0)', swatchBorder: 'oklch(60% 0.12 240)' },
];

const STORAGE_KEY = 'shms-theme';

function applyTheme(theme: ShmsTheme) {
  if (theme === 'precision-zen') {
    document.documentElement.removeAttribute('data-shms-theme');
  } else {
    document.documentElement.setAttribute('data-shms-theme', theme);
  }
}

export function useShmsTheme(): [ShmsTheme, (t: ShmsTheme) => void] {
  const [theme, setThemeState] = useState<ShmsTheme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as ShmsTheme) || 'precision-zen';
    } catch { return 'precision-zen'; }
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: ShmsTheme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* noop */ }
    applyTheme(t);
  }, []);

  return [theme, setTheme];
}

interface Props {
  expanded?: boolean;
}

export default function SHMSThemeSwitcher({ expanded = false }: Props) {
  const [theme, setTheme] = useShmsTheme();
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  return (
    <div className="shms-theme-switcher" style={{ position: 'relative' }}>
      {THEMES.map(t => (
        <button
          key={t.id}
          className={`shms-theme-swatch ${theme === t.id ? 'shms-theme-swatch--active' : ''}`}
          style={{ background: t.swatchColor, boxShadow: theme === t.id ? `0 0 8px ${t.swatchBorder}` : 'none' }}
          onClick={() => setTheme(t.id)}
          onMouseEnter={() => setShowTooltip(t.id)}
          onMouseLeave={() => setShowTooltip(null)}
          title={`${t.label}: ${t.description}`}
          aria-label={`Tema ${t.label}`}
        />
      ))}
      {/* Tooltip */}
      {showTooltip && (() => {
        const info = THEMES.find(t => t.id === showTooltip);
        if (!info) return null;
        return (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: '8px', padding: '6px 10px', background: 'var(--shms-bg-1)',
            border: '1px solid var(--shms-border)', borderRadius: 'var(--shms-radius-sm)',
            boxShadow: '0 4px 12px oklch(0% 0 0 / 0.3)', whiteSpace: 'nowrap', zIndex: 100,
            fontSize: '11px', pointerEvents: 'none',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>{info.label}</div>
            <div style={{ color: 'var(--shms-text-secondary)', fontSize: '10px' }}>{info.description}</div>
          </div>
        );
      })()}
    </div>
  );
}
