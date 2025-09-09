// src/adapters/figma-writer.ts
// Apply IR TokenGraph -> Figma variables (create/update, then set per-mode values)

import { dtcgToFigmaRGBA, type DocumentProfile } from '../core/color';
import { toDot } from '../core/normalize';
import { type TokenGraph, type TokenNode, type ValueOrAlias, type PrimitiveType, ctxKey } from '../core/ir';

function resolvedTypeFor(t: PrimitiveType): VariableResolvedDataType {
  if (t === 'color') return 'COLOR';
  if (t === 'number') return 'FLOAT';
  if (t === 'string') return 'STRING';
  return 'BOOLEAN';
}

function forEachKey<T>(obj: { [k: string]: T }): string[] {
  var out: string[] = [];
  var k: string;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
  return out;
}

export async function writeIRToFigma(graph: TokenGraph): Promise<void> {
  var profile = figma.root.documentColorProfile as DocumentProfile;
  var variablesApi = figma.variables;

  // Load existing collections
  var existing = await variablesApi.getLocalVariableCollectionsAsync();
  var colByName: { [name: string]: VariableCollection } = {};
  var ci = 0;
  for (ci = 0; ci < existing.length; ci++) colByName[existing[ci].name] = existing[ci];

  // Pass 1: ensure collections and variables exist; build path->id map
  var idByPath: { [dot: string]: string } = {};

  var i = 0;
  for (i = 0; i < graph.tokens.length; i++) {
    var t = graph.tokens[i];

    if (t.path.length < 1) continue;
    var collectionName = t.path[0];

    var collection = colByName[collectionName];
    if (!collection) {
      collection = variablesApi.createVariableCollection(collectionName);
      colByName[collectionName] = collection;
    }

    // variable name is everything after collection joined with '/'
    var j = 1, varName = '';
    for (j = 1; j < t.path.length; j++) {
      if (j > 1) varName += '/';
      varName += t.path[j];
    }

    // try to find existing variable by name
    var existingVarId: string | null = null;
    var k = 0;
    for (k = 0; k < collection.variableIds.length; k++) {
      var cand = await variablesApi.getVariableByIdAsync(collection.variableIds[k]);
      if (cand && cand.name === varName) { existingVarId = cand.id; break; }
    }

    var createdOrFound: Variable;
    if (existingVarId) {
      var got = await variablesApi.getVariableByIdAsync(existingVarId);
      if (!got) continue;
      createdOrFound = got;
    } else {
      var variableType = resolvedTypeFor(t.type);
      createdOrFound = variablesApi.createVariable(varName, collection, variableType);
    }

    idByPath[toDot(t.path)] = createdOrFound.id;
  }

  // Build mode id lookup by (collectionName, modeName)
  var modeIdByKey: { [key: string]: string } = {};
  var cols = await variablesApi.getLocalVariableCollectionsAsync();
  var cii = 0;
  for (cii = 0; cii < cols.length; cii++) {
    var c = cols[cii];
    var mi = 0;
    for (mi = 0; mi < c.modes.length; mi++) {
      var k2 = c.name + '/' + c.modes[mi].name;
      modeIdByKey[k2] = c.modes[mi].modeId;
    }
  }

  // Pass 2: set values (including aliases)
  for (i = 0; i < graph.tokens.length; i++) {
    var node = graph.tokens[i];

    var dot = toDot(node.path);
    var varId = idByPath[dot];
    if (!varId) continue;

    var targetVar = await variablesApi.getVariableByIdAsync(varId);
    if (!targetVar) continue;

    var ctxKeys = forEachKey(node.byContext);
    var z = 0;
    for (z = 0; z < ctxKeys.length; z++) {
      var ctx = ctxKeys[z];
      var val = node.byContext[ctx];

      var modeId = modeIdByKey[ctx];
      if (!modeId) continue;

      if (val.kind === 'alias') {
        var targetId = idByPath[toDot(val.path)];
        if (!targetId) continue;
        var alias = await variablesApi.createVariableAliasByIdAsync(targetId);
        targetVar.setValueForMode(modeId, alias);
      } else if (val.kind === 'color') {
        var rgba = dtcgToFigmaRGBA(val.value, profile);
        targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
      } else if (val.kind === 'number') {
        targetVar.setValueForMode(modeId, val.value);
      } else if (val.kind === 'string') {
        targetVar.setValueForMode(modeId, val.value);
      } else if (val.kind === 'boolean') {
        targetVar.setValueForMode(modeId, val.value);
      }
    }
  }
}
