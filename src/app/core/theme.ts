/** Tema de la página de reservas: contraste del texto y combinaciones listas a partir del color del logo. */

export type ButtonShape = 'pill' | 'rounded' | 'square';
export type ButtonFill = 'solid' | 'outline';
export type FontStyle = 'modern' | 'elegant' | 'warm';
export type HeaderStyle = 'cover' | 'color' | 'plain';

function channels(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '1c1a19';
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Texto blanco u oscuro sobre ese color, el que se lea mejor. */
export function textOn(hex: string): string {
  return contrast(hex, '#ffffff') >= contrast(hex, '#1c1a19') ? '#ffffff' : '#1c1a19';
}

/** Mezcla con blanco (amount 0–1): para fondos suaves con el tono de la marca. */
export function tint(hex: string, amount: number): string {
  return '#' + channels(hex).map((value) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0')).join('');
}

export interface ThemePreset {
  key: string;
  label: string;
  canvas: string;
  header: HeaderStyle;
}

/** Tres combinaciones listas con el color principal. */
export function presets(primary: string): ThemePreset[] {
  return [
    { key: 'claro', label: 'Claro', canvas: '#ffffff', header: 'cover' },
    { key: 'suave', label: 'Suave', canvas: tint(primary, 0.92), header: 'cover' },
    { key: 'intenso', label: 'Intenso', canvas: '#faf6ef', header: 'color' },
  ];
}

export const FONT_STACKS: Record<FontStyle, string> = {
  modern: "'Plus Jakarta Sans', system-ui, sans-serif",
  elegant: "Georgia, 'Times New Roman', serif",
  warm: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
};

export const SHAPE_RADIUS: Record<ButtonShape, string> = { pill: '999px', rounded: '14px', square: '6px' };
