"use strict";
(() => {
  // src/core/normalize.ts
  function normalize(graph) {
    const seen = /* @__PURE__ */ new Set();
    const tokens = [];
    for (const t of graph.tokens) {
      const key = t.path.join("/");
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push(t);
      }
    }
    return { tokens };
  }

  // src/core/plan.ts
  function planChanges(current, desired) {
    return {
      items: desired.tokens.map((t) => ({
        path: t.path,
        type: t.type,
        perContext: t.byContext
      }))
    };
  }

  // src/core/ir.ts
  var ctxKey = (collection, mode) => `${collection}/mode=${mode}`;
  var tokenNameFromPath = (p) => p.join("/");

  // src/adapters/dtcg-reader.ts
  function parse(root, opts) {
    if (typeof root !== "object" || root == null) {
      throw new Error("DTCG: root must be an object");
    }
    const tokens = [];
    walkGroup(root, [], void 0, tokens, opts);
    return { tokens };
  }
  function walkGroup(node, path, inheritedType, out, opts) {
    const groupType = typeof node["$type"] === "string" ? node["$type"] : inheritedType;
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (typeof value === "object" && value != null && ("$value" in value || "$type" in value || "$description" in value || "$extensions" in value)) {
        const t = tokenFromEntry(path.concat(key), value, groupType, opts);
        out.push(t);
      } else if (typeof value === "object" && value != null) {
        walkGroup(value, path.concat(key), groupType, out, opts);
      }
    }
  }
  function tokenFromEntry(path, entry, inheritedType, opts) {
    const typeRaw = typeof entry["$type"] === "string" ? entry["$type"] : void 0;
    const type = typeRaw ? typeRaw : inheritedType ? inheritedType : guessType(entry);
    if (!type) throw new Error(`Token ${path.join("/")} is missing $type and cannot be inferred`);
    const raw = entry["$value"];
    const valOrAlias = parseValueOrAlias(raw, type);
    const description = typeof entry["$description"] === "string" ? entry["$description"] : void 0;
    const extensions = typeof entry["$extensions"] === "object" && entry["$extensions"] !== null ? entry["$extensions"] : void 0;
    const byContext = { [ctxKey(opts.collectionName, opts.modeName)]: valOrAlias };
    return { path, type, byContext, description, extensions };
  }
  function guessType(entry) {
    if ("$value" in entry) {
      const v = entry["$value"];
      if (typeof v === "string") {
        if (/^\{[^}]+\}$/.test(v)) return "string";
        if (/^#?[0-9a-f]{3,8}$/i.test(v)) return "color";
        return "string";
      } else if (typeof v === "number") return "number";
      else if (typeof v === "boolean") return "boolean";
      else if (typeof v === "object" && v && "colorSpace" in v) return "color";
    }
    return void 0;
  }
  function parseValueOrAlias(raw, type) {
    if (typeof raw === "string" && /^\{[^}]+\}$/.test(raw)) {
      return { kind: "alias", path: raw.slice(1, -1) };
    }
    switch (type) {
      case "color": {
        if (typeof raw === "string") {
          const hex = raw.replace(/^#/, "");
          const rgb = hex.length === 3 ? hex.split("").map((c) => parseInt(c + c, 16) / 255) : hex.length === 6 || hex.length === 8 ? [0, 1, 2].map((i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255) : null;
          const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : void 0;
          if (!rgb) throw new Error("Unsupported hex color: " + raw);
          return { kind: "color", value: { colorSpace: "srgb", components: [rgb[0], rgb[1], rgb[2]], alpha, hex: "#" + hex } };
        } else if (typeof raw === "object" && raw && "colorSpace" in raw) {
          return { kind: "color", value: raw };
        }
        throw new Error("Color token requires hex or srgb object");
      }
      case "number":
        return { kind: "number", value: Number(raw) };
      case "boolean":
        return { kind: "boolean", value: Boolean(raw) };
      case "string":
        return { kind: "string", value: String(raw) };
      case "dimension": {
        if (typeof raw === "object" && raw && "value" in raw && "unit" in raw) {
          return { kind: "dimension", value: raw };
        }
        throw new Error("Dimension token requires {value, unit}");
      }
      default:
        return { kind: "string", value: String(raw) };
    }
  }

  // src/adapters/dtcg-writer.ts
  function serialize(graph, opts) {
    return opts.format === "perMode" ? serializePerMode(graph) : serializeSingle(graph);
  }
  function serializePerMode(graph) {
    const byCtx = {};
    for (const t of graph.tokens) {
      for (const [ctx, v] of Object.entries(t.byContext)) {
        (byCtx[ctx] ? byCtx[ctx] : byCtx[ctx] = []).push((function() {
          const copy = { path: t.path.slice(0), type: t.type, byContext: {} };
          if (t.description) copy.description = t.description;
          if (t.extensions) copy.extensions = t.extensions;
          copy.byContext[ctx] = v;
          return copy;
        })());
      }
    }
    const files = [];
    for (const [ctx, tokens] of Object.entries(byCtx)) {
      const json = tokensToDtcg(tokens, { includeExtensions: true });
      const safeName = ctx.replace(/[\/:]/g, "_");
      files.push({ name: `tokens_${safeName}.json`, json });
    }
    return { files };
  }
  function serializeSingle(graph) {
    const json = tokensToDtcg(graph.tokens, { includeExtensions: true, includeAllContexts: true });
    return { files: [{ name: "tokens_all.json", json }] };
  }
  function tokensToDtcg(tokens, opts) {
    const root = {};
    for (const t of tokens) {
      const leafContainer = ensurePath(root, t.path.slice(0, -1));
      const name = t.path[t.path.length - 1];
      let value;
      let exts = void 0;
      const entries = Object.entries(t.byContext);
      if (entries.length === 1 && !opts.includeAllContexts) {
        value = valueOut(entries[0][1]);
      } else {
        const valuesByContext = {};
        for (const [ctx, v] of entries) valuesByContext[ctx] = valueOut(v);
        exts = (function() {
          var base = {};
          if (t.extensions) {
            for (var k in t.extensions) {
              if (Object.prototype.hasOwnProperty.call(t.extensions, k)) base[k] = t.extensions[k];
            }
          }
          base.org = { figma: { valuesByContext } };
          return base;
        })();
        value = valueOut(entries[0][1]);
      }
      const obj = { $type: t.type, $value: value };
      if (t.description) obj.$description = t.description;
      if (opts.includeExtensions && (exts || t.extensions)) {
        obj.$extensions = exts || t.extensions;
      }
      leafContainer[name] = obj;
    }
    return root;
  }
  function valueOut(v) {
    if ("kind" in v && v.kind === "alias") return `{${v.path}}`;
    if ("kind" in v && v.kind === "color") {
      if (v.value.hex) return v.value.hex;
      const [r, g, b] = v.value.components;
      const a = v.value.alpha || 1;
      if (a === 1) return rgbToHex(r, g, b);
      return { colorSpace: "srgb", components: [r, g, b], alpha: a };
    }
    if ("kind" in v && v.kind === "dimension") return v.value;
    if ("kind" in v) return v.value;
    return v;
  }
  function ensurePath(root, path) {
    let cur = root;
    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      if (!Object.prototype.hasOwnProperty.call(cur, p) || cur[p] == null) {
        cur[p] = {};
      }
      cur = cur[p];
    }
    return cur;
  }
  function rgbToHex(r, g, b) {
    const c = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }

  // src/core/color.ts
  function figmaToSrgb(r, g, b, a = 1) {
    return { colorSpace: "srgb", components: [clamp01(r), clamp01(g), clamp01(b)], alpha: clamp01(a) };
  }
  var clamp01 = (x) => Math.max(0, Math.min(1, x));

  // src/figma/variables.ts
  function ensureCollection(name) {
    const found = figma.variables.getLocalVariableCollections().find((c) => c.name === name);
    if (found) {
      return found;
    }
    return figma.variables.createVariableCollection(name);
  }
  function ensureMode(c, modeName) {
    const found = c.modes.find((m) => m.name === modeName);
    if (found) {
      return found.modeId;
    }
    return c.addMode(modeName);
  }
  function upsertVariable(c, name, resolvedType) {
    for (const id of c.variableIds) {
      const v = figma.variables.getVariableById(id);
      if (v && v.name === name) return v;
    }
    return figma.variables.createVariable(name, c, resolvedType);
  }
  function findVariableByPath(path) {
    const name = path;
    for (const c of figma.variables.getLocalVariableCollections()) {
      for (const id of c.variableIds) {
        const v = figma.variables.getVariableById(id);
        if (v && v.name === name) return v;
      }
    }
    return null;
  }
  function irToFigmaValue(v) {
    if ("kind" in v && v.kind === "color") {
      const { components, alpha } = v.value;
      return { r: components[0], g: components[1], b: components[2], a: typeof alpha === "number" ? alpha : 1 };
    }
    if ("kind" in v && v.kind === "number") return v.value;
    if ("kind" in v && v.kind === "boolean") return v.value;
    if ("kind" in v && v.kind === "string") return v.value;
    if ("kind" in v && v.kind === "dimension") return v.value.value;
    return v;
  }
  function figmaColorToIR(c) {
    return figmaToSrgb(c.r, c.g, c.b, c.a);
  }

  // src/adapters/figma-reader.ts
  async function snapshot() {
    const tokens = [];
    const collections = figma.variables.getLocalVariableCollections();
    for (let ci = 0; ci < collections.length; ci++) {
      const c = collections[ci];
      for (let vi = 0; vi < c.variableIds.length; vi++) {
        const vid = c.variableIds[vi];
        const v = figma.variables.getVariableById(vid);
        if (!v) continue;
        const path = v.name.split("/");
        const type = mapType(v.resolvedType);
        const byContext = {};
        for (let mi = 0; mi < c.modes.length; mi++) {
          const m = c.modes[mi];
          const ctx = ctxKey(c.name, m.name);
          const mv = v.valuesByMode[m.modeId];
          if (isAliasValue(mv)) {
            const target = figma.variables.getVariableById(mv.id);
            if (target) {
              byContext[ctx] = {
                kind: "alias",
                path: tokenNameFromPath(target.name.split("/"))
              };
            }
            continue;
          }
          if (isRGBA(mv)) {
            byContext[ctx] = { kind: "color", value: figmaColorToIR({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }) };
            continue;
          }
          if (typeof mv === "number") {
            byContext[ctx] = { kind: "number", value: mv };
            continue;
          }
          if (typeof mv === "boolean") {
            byContext[ctx] = { kind: "boolean", value: mv };
            continue;
          }
          if (typeof mv === "string") {
            byContext[ctx] = { kind: "string", value: mv };
            continue;
          }
        }
        tokens.push({ path, type, byContext });
      }
    }
    return { tokens };
  }
  function mapType(t) {
    switch (t) {
      case "COLOR":
        return "color";
      case "STRING":
        return "string";
      case "BOOLEAN":
        return "boolean";
      case "FLOAT":
        return "number";
      default:
        return "string";
    }
  }
  function isObject(o) {
    return typeof o === "object" && o !== null;
  }
  function isAliasValue(v) {
    if (!isObject(v)) return false;
    if (!("type" in v) || !("id" in v)) return false;
    const t = v["type"];
    const id = v["id"];
    return typeof t === "string" && t === "VARIABLE_ALIAS" && typeof id === "string";
  }
  function isRGBA(v) {
    if (!isObject(v)) return false;
    const r = v["r"];
    const g = v["g"];
    const b = v["b"];
    const a = v["a"];
    return typeof r === "number" && typeof g === "number" && typeof b === "number" && typeof a === "number";
  }

  // src/adapters/figma-writer.ts
  async function apply(plan) {
    for (const item of plan.items) {
      const perCollection = {};
      for (const [ctx, val] of Object.entries(item.perContext)) {
        const [collection, modeEq] = ctx.split("/mode=");
        if (!perCollection[collection]) {
          perCollection[collection] = [];
        }
        perCollection[collection].push({ mode: modeEq, value: val });
      }
      for (const [collectionName, entries] of Object.entries(perCollection)) {
        const c = ensureCollection(collectionName);
        const figmaType = mapToFigmaType(item.type);
        const varName = item.path.join("/");
        const variable = upsertVariable(c, varName, figmaType);
        for (const { mode, value } of entries) {
          const modeId = ensureMode(c, mode);
          if (value && "kind" in value && value.kind === "alias") {
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
  function mapToFigmaType(t) {
    switch (t) {
      case "color":
        return "COLOR";
      case "number":
        return "FLOAT";
      case "string":
        return "STRING";
      case "boolean":
        return "BOOLEAN";
      default:
        return "STRING";
    }
  }

  // src/core/pipeline.ts
  async function importDtcg(json, opts) {
    const desiredGraph = normalize(parse(json, { collectionName: opts.collectionName, modeName: opts.modeName }));
    const current = await snapshot();
    const plan = planChanges(current, desiredGraph);
    await apply(plan);
  }
  async function exportDtcg(opts) {
    const current = await snapshot();
    const graph = normalize(current);
    return serialize(graph, opts);
  }

  // src/app/main.ts
  figma.showUI(__html__, { width: 420, height: 520 });
  function send(msg) {
    figma.ui.postMessage(msg);
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "IMPORT_DTCG") {
        const { json, collection, mode } = msg.payload;
        await importDtcg(json, { collectionName: collection, modeName: mode });
        send({ type: "INFO", payload: { message: "Import completed." } });
      } else if (msg.type === "EXPORT_DTCG") {
        const result = await exportDtcg({ format: msg.payload.format });
        send({ type: "EXPORT_RESULT", payload: { files: result.files } });
      }
    } catch (e) {
      send({ type: "ERROR", payload: { message: String((e == null ? void 0 : e.message) || e) } });
      console.error(e);
    }
  };
})();
//# sourceMappingURL=main.js.map
