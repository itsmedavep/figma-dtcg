// src/figma/variables.ts
// Small helpers used by the Figma adapters.

import { type PrimitiveType, type ValueOrAlias } from '../core/ir';
import { dtcgToFigmaRGBA, type DocumentProfile } from '../core/color';

export function resolvedTypeFor(t: PrimitiveType): VariableResolvedDataType {
  if (t === 'color') return 'COLOR';
  if (t === 'number') return 'FLOAT';
  if (t === 'string') return 'STRING';
  return 'BOOLEAN';
}

export async function applyValueForMode(
  variable: Variable,
  modeId: string,
  value: ValueOrAlias,
  profile: DocumentProfile,
  getVarIdByPath: (dotPath: string) => string | null,
  toDot: (parts: string[]) => string
): Promise<void> {
  if (value.kind === 'alias') {
    var targetId = getVarIdByPath(toDot(value.path));
    if (!targetId) return;
    var alias = await figma.variables.createVariableAliasByIdAsync(targetId);
    variable.setValueForMode(modeId, alias);
    return;
  }

  if (value.kind === 'color') {
    var rgba = dtcgToFigmaRGBA(value.value, profile);
    variable.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
    return;
  }

  if (value.kind === 'number') { variable.setValueForMode(modeId, value.value); return; }
  if (value.kind === 'string') { variable.setValueForMode(modeId, value.value); return; }
  if (value.kind === 'boolean') { variable.setValueForMode(modeId, value.value); return; }
}
