
import type { ApplyPlan } from '../core/plan';
import type { ValueOrAlias } from '../core/ir';
import { ensureCollection, ensureMode, upsertVariable, irToFigmaValue, findVariableByPath } from '../figma/variables';

export async function apply(plan: ApplyPlan) {
  // For each item: ensure collection+mode, upsert variable, set per-mode values.
  // Context key format: 'Collection/mode=Name'
  for (const item of plan.items) {
    // group changes by collection
    const perCollection: Record<string, Array<{ mode: string; value: ValueOrAlias }>> = {};
    for (const [ctx, val] of Object.entries(item.perContext)) {
      const [collection, modeEq] = ctx.split('/mode=');
      if (!perCollection[collection]) { perCollection[collection] = []; } perCollection[collection].push({ mode: modeEq, value: val });
    }

    for (const [collectionName, entries] of Object.entries(perCollection)) {
      const c = ensureCollection(collectionName);
      // Determine Figma type
      const figmaType = mapToFigmaType(item.type);
      const varName = item.path.join('/');
      const variable = upsertVariable(c, varName, figmaType);
      // Ensure modes
      for (const { mode, value } of entries) {
        const modeId = ensureMode(c, mode);
        if (value && 'kind' in value && value.kind === 'alias') {
          const target = findVariableByPath(value.path);
          if (!target) throw new Error(`Alias target not found: ${value.path}`);
          variable.setValueForMode(modeId, figma.variables.createVariableAlias(target));
        } else {
          variable.setValueForMode(modeId, irToFigmaValue(value));
        }
      }
    }
  }
}

function mapToFigmaType(t: string): VariableResolvedDataType {
  switch (t) {
    case 'color': return 'COLOR';
    case 'number': return 'FLOAT';
    case 'string': return 'STRING';
    case 'boolean': return 'BOOLEAN';
    default: return 'STRING';
  }
}
