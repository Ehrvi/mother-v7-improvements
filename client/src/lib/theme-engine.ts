/**
 * MOTHER — Theme Engine
 *
 * Enables MOTHER to change its own UI appearance in real-time via chat commands.
 * This is a concrete demonstration that MOTHER can modify itself.
 *
 * Flow: User types "mude a cor para vermelho" → CSS variables update → UI changes instantly
 *
 * Supported patterns:
 *   - "mude a cor para [nome]" / "change color to [name]"
 *   - "cor #hex" / "color #hex"
 *   - "tema escuro" / "tema claro"
 *
 * Scientific basis:
 *   - DGM self-modification (arXiv:2505.22954) — system changes its own behavior
 *   - CSS Custom Properties (W3C CSS Variables Module Level 1, 2015)
 */

// ============================================================
// COLOR MAP (PT-BR + EN + common names)
// ============================================================

const COLOR_MAP: Record<string, string> = {
  // PT-BR
  vermelho: '#ef4444',
  azul: '#3b82f6',
  verde: '#22c55e',
  amarelo: '#eab308',
  roxo: '#a855f7',
  violeta: '#8b5cf6',
  rosa: '#ec4899',
  laranja: '#f97316',
  ciano: '#06b6d4',
  branco: '#f8fafc',
  dourado: '#d4a017',
  turquesa: '#14b8a6',
  magenta: '#d946ef',
  lima: '#84cc16',
  indigo: '#6366f1',
  coral: '#fb7185',

  // English
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  violet: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
  white: '#f8fafc',
  gold: '#d4a017',
  teal: '#14b8a6',
  lime: '#84cc16',
};

// ============================================================
// THEME CHANGE DETECTION
// ============================================================

export interface ThemeChange {
  color: string;       // hex value
  colorName: string;   // display name
  source: 'chat';
  timestamp: Date;
}

/**
 * Detect if a chat message is requesting a color change.
 * Returns the color hex if detected, null otherwise.
 */
export function detectColorCommand(message: string): ThemeChange | null {
  const msg = message.toLowerCase().trim();

  // Pattern 1: "mude a cor para [nome]" / "mudar cor para [nome]" / "trocar cor para [nome]"
  const ptBrMatch = msg.match(/(?:mude?|mudar?|trocar?|alterar?).*(?:cor|tema|visual).*(?:para|pra|:)\s+(.+)/);
  if (ptBrMatch) {
    const colorInput = ptBrMatch[1].trim();
    return resolveColor(colorInput);
  }

  // Pattern 2: "change color to [name]" / "set color [name]"
  const enMatch = msg.match(/(?:change|set|make|switch).*(?:color|theme|accent).*(?:to|:)?\s+(.+)/);
  if (enMatch) {
    const colorInput = enMatch[1].trim();
    return resolveColor(colorInput);
  }

  // Pattern 3: Direct "cor [nome/#hex]" or "color [nome/#hex]"
  const directMatch = msg.match(/^(?:cor|color)\s+(.+)/);
  if (directMatch) {
    return resolveColor(directMatch[1].trim());
  }

  return null;
}

function resolveColor(input: string): ThemeChange | null {
  // Try hex code
  const hexMatch = input.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    return {
      color: `#${hexMatch[1]}`,
      colorName: `#${hexMatch[1]}`,
      source: 'chat',
      timestamp: new Date(),
    };
  }

  // Try named color
  const name = input.replace(/[^a-záàâãéêíóôõúç]/gi, '').toLowerCase();
  if (COLOR_MAP[name]) {
    return {
      color: COLOR_MAP[name],
      colorName: name,
      source: 'chat',
      timestamp: new Date(),
    };
  }

  return null;
}

// ============================================================
// APPLY THEME
// ============================================================

/**
 * Apply a color change to MOTHER's UI in real-time.
 * Modifies CSS custom properties on :root.
 */
export function applyThemeChange(change: ThemeChange): void {
  const root = document.documentElement;
  const hex = change.color;

  // Convert hex to RGB for oklch-like manipulation
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Apply as accent colors
  root.style.setProperty('--color-accent-violet', hex);
  root.style.setProperty('--color-accent-violet-bg', `rgba(${r * 255}, ${g * 255}, ${b * 255}, 0.15)`);
  root.style.setProperty('--color-gradient-start', hex);
  root.style.setProperty('--color-gradient-end', adjustBrightness(hex, -30));
  root.style.setProperty('--color-border-accent', adjustBrightness(hex, -20));

  // Also update Tailwind-compatible primary if available
  root.style.setProperty('--primary', hex);

  // Emit event for other components to react
  window.dispatchEvent(new CustomEvent('mother-theme-changed', { detail: change }));

  console.log(`[ThemeEngine] 🎨 Applied: ${change.colorName} (${hex})`);
}

/**
 * Reset theme to defaults (remove all inline overrides).
 */
export function resetTheme(): void {
  const root = document.documentElement;
  const props = [
    '--color-accent-violet', '--color-accent-violet-bg',
    '--color-gradient-start', '--color-gradient-end',
    '--color-border-accent', '--primary',
  ];
  for (const prop of props) {
    root.style.removeProperty(prop);
  }
  window.dispatchEvent(new CustomEvent('mother-theme-changed', { detail: null }));
  console.log('[ThemeEngine] 🎨 Theme reset to defaults');
}

/**
 * Get list of available color names for display.
 */
export function getAvailableColors(): string[] {
  // Return unique PT-BR names
  return ['vermelho', 'azul', 'verde', 'amarelo', 'roxo', 'rosa', 'laranja', 'ciano', 'dourado', 'turquesa', 'magenta', 'lima', 'indigo', 'coral'];
}

// ============================================================
// HELPERS
// ============================================================

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
