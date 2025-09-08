
import type { TokenGraph, TokenNode, ValueOrAlias } from './ir';

export interface ApplyItem {
  path: string[];
  type: TokenNode['type'];
  perContext: Record<string, ValueOrAlias>;
}
export interface ApplyPlan { items: ApplyItem[] }

/** A minimal 'plan': just upsert all tokens and set their per-context values. */
export function planChanges(current: TokenGraph, desired: TokenGraph): ApplyPlan {
  // In a real diff we would compute creates/updates/deletes.
  // For now, just adopt everything from desired.
  return {
    items: desired.tokens.map(t => ({
      path: t.path,
      type: t.type,
      perContext: t.byContext
    }))
  };
}
