
import type { ValueOrAlias, ColorValue } from '../core/ir';
import { figmaToSrgb } from '../core/color';

export function ensureCollection(name: string): VariableCollection {
  const found = figma.variables.getLocalVariableCollections().find(c => c.name === name);
  if (found) { return found; } return figma.variables.createVariableCollection(name);
}
export function ensureMode(c: VariableCollection, modeName: string): string {
  const found = c.modes.find(m => m.name === modeName);
  if (found) { return found.modeId; } return c.addMode(modeName);
}
export function upsertVariable(c: VariableCollection, name: string, resolvedType: VariableResolvedDataType): Variable {
  for (const id of c.variableIds) {
    const v = figma.variables.getVariableById(id);
    if (v && v.name === name) return v;
  }
  return figma.variables.createVariable(name, c, resolvedType);
}
export function findVariableByPath(path: string): Variable | null {
  const name = path; // already 'a/b/c'
  for (const c of figma.variables.getLocalVariableCollections()) {
    for (const id of c.variableIds) {
      const v = figma.variables.getVariableById(id);
      if (v && v.name === name) return v;
    }
  }
  return null;
}

export function irToFigmaValue(v: ValueOrAlias): any {
  if ('kind' in v && v.kind === 'color') {
    const { components, alpha } = v.value;
    return { r: components[0], g: components[1], b: components[2], a: (typeof alpha === 'number' ? alpha : 1) };
  }
  if ('kind' in v && v.kind === 'number') return v.value;
  if ('kind' in v && v.kind === 'boolean') return v.value;
  if ('kind' in v && v.kind === 'string') return v.value;
  if ('kind' in v && v.kind === 'dimension') return v.value.value; // no unit in Figma
  return v as any;
}

export function figmaColorToIR(c: {r:number;g:number;b:number;a:number}): ColorValue {
  return figmaToSrgb(c.r, c.g, c.b, c.a);
}
