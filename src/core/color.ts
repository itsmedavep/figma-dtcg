
import type { ColorValue } from './ir';

export function srgbToFigma(color: ColorValue): { r:number; g:number; b:number; a:number } {
  const [r,g,b] = color.components.map(c => clamp01(c)) as [number,number,number];
  const a = (typeof color.alpha === 'number' ? color.alpha : 1);
  return { r, g, b, a: clamp01(a) };
}
export function figmaToSrgb(r: number, g: number, b: number, a=1): ColorValue {
  return { colorSpace: 'srgb', components: [clamp01(r), clamp01(g), clamp01(b)], alpha: clamp01(a) };
}
const clamp01 = (x:number) => Math.max(0, Math.min(1, x));
