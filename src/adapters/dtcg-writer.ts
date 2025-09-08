
import type { TokenGraph, TokenNode, ValueOrAlias } from '../core/ir';

interface SerializeResult {
  files: Array<{ name: string; json: any }>;
}
interface ExportOpts { format: 'single'|'perMode' }

export function serialize(graph: TokenGraph, opts: ExportOpts): SerializeResult {
  return opts.format === 'perMode' ? serializePerMode(graph) : serializeSingle(graph);
}

function serializePerMode(graph: TokenGraph): SerializeResult {
  // group by context key
  const byCtx: Record<string, TokenNode[]> = {};
  for (const t of graph.tokens) {
    for (const [ctx, v] of Object.entries(t.byContext)) {
      ((byCtx[ctx]) ? byCtx[ctx] : (byCtx[ctx] = [])).push((function(){ const copy:any = { path: t.path.slice(0), type: t.type, byContext: {} }; if (t.description) copy.description = t.description; if (t.extensions) copy.extensions = t.extensions; copy.byContext[ctx] = v; return copy; })());
    }
  }
  const files: Array<{ name: string; json: any }> = [];
  for (const [ctx, tokens] of Object.entries(byCtx)) {
    const json = tokensToDtcg(tokens, { includeExtensions: true });
    const safeName = ctx.replace(/[\/:]/g, '_');
    files.push({ name: `tokens_${safeName}.json`, json });
  }
  return { files };
}

function serializeSingle(graph: TokenGraph): SerializeResult {
  const json = tokensToDtcg(graph.tokens, { includeExtensions: true, includeAllContexts: true });
  return { files: [{ name: 'tokens_all.json', json }] };
}

function tokensToDtcg(tokens: TokenNode[], opts: { includeExtensions: boolean; includeAllContexts?: boolean }) {
  // Emit a flat object with group nesting based on path segments.
  const root: any = {};
  for (const t of tokens) {
    const leafContainer = ensurePath(root, t.path.slice(0, -1));
    const name = t.path[t.path.length-1];

    // Choose one value if only one context; else emit $extensions.org.figma.valuesByContext
    let value: any;
    let exts: any = undefined;
    const entries = Object.entries(t.byContext);
    if (entries.length === 1 && !opts.includeAllContexts) {
      value = valueOut(entries[0][1]);
    } else {
      // keep values by context
      const valuesByContext: Record<string, any> = {};
      for (const [ctx, v] of entries) valuesByContext[ctx] = valueOut(v);
      exts = (function(){ var base:any = {}; if (t.extensions) { for (var k in t.extensions) { if (Object.prototype.hasOwnProperty.call(t.extensions, k)) base[k] = (t.extensions as any)[k]; } } base.org = { figma: { valuesByContext: valuesByContext } }; return base; })();
      value = valueOut(entries[0][1]); // pick first as default
    }
    const obj: any = { $type: t.type, $value: value };
    if (t.description) obj.$description = t.description;
    if (opts.includeExtensions && (exts || t.extensions)) {
      obj.$extensions = exts || t.extensions;
    }
    leafContainer[name] = obj;
  }
  return root;
}

function valueOut(v: ValueOrAlias) {
  if ('kind' in v && v.kind === 'alias') return `{${v.path}}`;
  if ('kind' in v && v.kind === 'color') {
    if (v.value.hex) return v.value.hex;
    const [r,g,b] = v.value.components;
    const a = v.value.alpha || 1;
    if (a === 1) return rgbToHex(r,g,b);
    return { colorSpace: 'srgb', components: [r,g,b], alpha: a };
  }
  if ('kind' in v && v.kind === 'dimension') return v.value;
  if ('kind' in v) return v.value as any;
  return v as any;
}

function ensurePath(root:any, path:string[]) {
  let cur = root;
  for (var i=0; i<path.length; i++){ var p = path[i]; if (!Object.prototype.hasOwnProperty.call(cur, p) || cur[p] == null) { cur[p] = {}; } cur = cur[p]; }
  return cur;
}

function rgbToHex(r:number,g:number,b:number) {
  const c = (x:number) => Math.round(x*255).toString(16).padStart(2, '0');
  return '#' + c(r)+c(g)+c(b);
}

