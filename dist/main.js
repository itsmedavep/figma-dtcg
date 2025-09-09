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

  // src/adapters/dtcg-reader.ts
  function isDict(o) {
    return typeof o === "object" && o !== null;
  }
  function parse(root) {
    if (!isDict(root)) throw new Error("DTCG: root must be an object");
    var tokens = [];
    walkGroup(root, [], void 0, tokens);
    return { tokens };
  }
  function walkGroup(node, path, inheritedType, out) {
    if (!isDict(node)) return;
    var groupType = inheritedType;
    if (typeof node["$type"] === "string") groupType = node["$type"];
    var key;
    for (key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      if (key.length > 0 && key.charAt(0) === "$") continue;
      var value = node[key];
      if (isDict(value)) {
        if (hasTokenShape(value)) {
          var t = tokenFromEntry(path.concat(key), value, groupType);
          out.push(t);
        } else {
          walkGroup(value, path.concat(key), groupType, out);
        }
      }
    }
  }
  function hasTokenShape(o) {
    if (Object.prototype.hasOwnProperty.call(o, "$value")) return true;
    if (Object.prototype.hasOwnProperty.call(o, "$type")) return true;
    if (Object.prototype.hasOwnProperty.call(o, "$description")) return true;
    if (Object.prototype.hasOwnProperty.call(o, "$extensions")) return true;
    return false;
  }
  function tokenFromEntry(path, entry, inheritedType) {
    var explicitType = void 0;
    if (typeof entry["$type"] === "string") explicitType = entry["$type"];
    var type = explicitType ? explicitType : inheritedType;
    if (!type) {
      type = guessType(entry);
      if (!type) throw new Error("Token " + path.join("/") + " missing $type and cannot be inferred");
    }
    var description = void 0;
    if (typeof entry["$description"] === "string") description = String(entry["$description"]);
    var extensions = void 0;
    if (isDict(entry["$extensions"])) extensions = entry["$extensions"];
    var byContext = {};
    var ctxMap = contextsFromExtensions(entry, type);
    if (ctxMap) {
      byContext = ctxMap;
    } else {
      var raw = entry["$value"];
      var coll = "Imported";
      var mode = "Default";
      var extOrg = safeGet(entry, ["$extensions", "org", "figma"]);
      if (isDict(extOrg)) {
        var cName = extOrg["collectionName"];
        var mName = extOrg["modeName"];
        if (typeof cName === "string") coll = cName;
        if (typeof mName === "string") mode = mName;
      }
      byContext[ctxKey(coll, mode)] = parseValueOrAlias(raw, type);
    }
    return { path, type, byContext, description, extensions };
  }
  function safeGet(obj, path) {
    var cur = obj;
    var i;
    for (i = 0; i < path.length; i++) {
      if (!isDict(cur)) return void 0;
      var k = path[i];
      if (!Object.prototype.hasOwnProperty.call(cur, k)) return void 0;
      cur = cur[k];
    }
    return cur;
  }
  function contextsFromExtensions(entry, type) {
    var valuesByCtx = safeGet(entry, ["$extensions", "org", "figma", "valuesByContext"]);
    if (!isDict(valuesByCtx)) return null;
    var byContext = {};
    var k;
    for (k in valuesByCtx) {
      if (!Object.prototype.hasOwnProperty.call(valuesByCtx, k)) continue;
      var raw = valuesByCtx[k];
      byContext[k] = parseValueOrAlias(raw, type);
    }
    return byContext;
  }
  function guessType(entry) {
    if (Object.prototype.hasOwnProperty.call(entry, "$value")) {
      var v = entry["$value"];
      if (typeof v === "string") {
        if (/^\{[^}]+\}$/.test(v)) return "string";
        if (/^#?[0-9a-f]{3,8}$/i.test(v)) return "color";
        return "string";
      } else if (typeof v === "number") return "number";
      else if (typeof v === "boolean") return "boolean";
      else if (isDict(v) && Object.prototype.hasOwnProperty.call(v, "colorSpace")) return "color";
    }
    return void 0;
  }
  function parseValueOrAlias(raw, type) {
    if (typeof raw === "string" && /^\{[^}]+\}$/.test(raw)) {
      return { kind: "alias", path: raw.slice(1, raw.length - 1) };
    }
    if (type === "color") {
      if (typeof raw === "string") {
        var hex = raw.replace(/^#/, "");
        var rgb = null;
        if (hex.length === 3) {
          rgb = [0, 1, 2].map(function(i) {
            var c = hex.charAt(i);
            return parseInt(c + c, 16) / 255;
          });
        } else if (hex.length === 6 || hex.length === 8) {
          rgb = [0, 1, 2].map(function(i) {
            return parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255;
          });
        }
        var alpha = void 0;
        if (hex.length === 8) alpha = parseInt(hex.slice(6, 8), 16) / 255;
        if (!rgb) throw new Error("Unsupported hex color: " + String(raw));
        return { kind: "color", value: { colorSpace: "srgb", components: [rgb[0], rgb[1], rgb[2]], alpha, hex: "#" + hex } };
      } else if (isDict(raw) && Object.prototype.hasOwnProperty.call(raw, "colorSpace")) {
        return { kind: "color", value: raw };
      }
      throw new Error("Color token requires hex or srgb object");
    }
    if (type === "number") return { kind: "number", value: Number(raw) };
    if (type === "boolean") return { kind: "boolean", value: Boolean(raw) };
    if (type === "string") return { kind: "string", value: String(raw) };
    return { kind: "string", value: String(raw) };
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

  // src/adapters/figma-reader.ts
  function mapType(rt) {
    if (rt === "COLOR") return "color";
    if (rt === "FLOAT") return "number";
    if (rt === "BOOLEAN") return "boolean";
    return "string";
  }
  function isAliasValue(v) {
    return typeof v === "object" && v !== null && v.type === "VARIABLE_ALIAS" && typeof v.id === "string";
  }
  function isRGBA(v) {
    if (typeof v !== "object" || v === null) return false;
    var o = v;
    return typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number" && typeof o.a === "number";
  }
  function figmaColorToIR(c) {
    const comps = [c.r, c.g, c.b];
    const SRGB = "srgb";
    return { colorSpace: SRGB, components: comps, alpha: c.a };
  }
  async function snapshot() {
    const tokens = [];
    const vars = figma.variables;
    let collections = [];
    if (typeof vars.getLocalVariableCollectionsAsync === "function" && vars.getLocalVariableCollectionsAsync) {
      collections = await vars.getLocalVariableCollectionsAsync();
    } else {
      collections = vars.getLocalVariableCollections();
    }
    let ci;
    for (ci = 0; ci < collections.length; ci++) {
      const c = collections[ci];
      if (!c) continue;
      let vi;
      for (vi = 0; vi < c.variableIds.length; vi++) {
        const vid = c.variableIds[vi];
        let v = null;
        if (typeof vars.getVariableByIdAsync === "function" && vars.getVariableByIdAsync) {
          v = await vars.getVariableByIdAsync(vid);
        } else {
          v = vars.getVariableById(vid);
        }
        if (!v) continue;
        const path = v.name.split("/");
        const type = mapType(v.resolvedType);
        const byContext = {};
        let mi;
        for (mi = 0; mi < c.modes.length; mi++) {
          const m = c.modes[mi];
          const ctx = ctxKey(c.name, m.name);
          const mv = v.valuesByMode[m.modeId];
          if (isAliasValue(mv)) {
            let target = null;
            if (typeof vars.getVariableByIdAsync === "function" && vars.getVariableByIdAsync) {
              target = await vars.getVariableByIdAsync(mv.id);
            } else {
              target = vars.getVariableById(mv.id);
            }
            if (target) {
              byContext[ctx] = {
                kind: "alias",
                // Use the canonical slash-separated variable name as path
                path: target.name
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
  async function importDtcg(json) {
    const desiredGraph = normalize(parse(json));
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
  figma.showUI(`<!doctype html>
<html>

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DTCG Import/Export</title>
  <style>
    :root {
      --bg: #ffffff;
      --ink: #111827;
      --ink-subtle: #4b5563;
      --ink-muted: #6b7280;
      --surface: #f9fafb;
      --accent: #1e88e5;
      --accent-ink: #ffffff;
      --border: #e5e7eb
    }

    html,
    body {
      height: 100%;
      margin: 0
    }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      line-height: 1.4
    }

    /* Force the working area to occupy all available space */
    .shell {
      height: 100vh;
      /* ensures full iframe height */
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
      grid-template-rows: 1fr;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
      grid-auto-flow: column;
    }

    .col {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0
    }

    .panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      flex: 1;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 10px;
      padding: .5rem;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 4px 12px;
      border-bottom: 1px solid var(--border)
    }

    .eyebrow {
      font-size: 11px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--ink-muted);
      margin: 0 0 2px 0
    }

    .title {
      font-size: 16px;
      font-weight: 700;
      margin: 0
    }

    .panel-body {
      padding: px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
      flex: 1;
      /* \u2190 make body fill panel */
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center
    }

    .row>* {
      flex: 1;
      min-width: 0
    }

    label {
      font-size: 12px;
      color: var(--ink-subtle);
      display: block;
      margin-bottom: 4px
    }

    input[type="text"],
    select,
    input[type="file"] {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
      font-size: 12px;
      box-sizing: border-box
    }

    button {
      padding: 10px 12px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: var(--accent-ink);
      font-weight: 600;
      cursor: pointer;
      font-size: 13px
    }

    button[disabled] {
      opacity: .5;
      cursor: not-allowed
    }

    .muted {
      color: var(--ink-muted);
      font-size: 12px
    }

    /* Middle column raw view */
    pre {
      margin: 0;
      padding: 12px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      overflow: auto;
      white-space: pre;
      min-width: 0;
      min-height: 0;
      flex: 1;
      /* \u2190 stretch */
      height: 100%;
    }

    /* Right column log */
    #log {
      padding: 12px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      white-space: pre-wrap;
      overflow: auto;
      min-width: 0;
      min-height: 0;
      flex: 1;
      /* \u2190 stretch */
      height: 100%;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 10px
    }

    .row-center {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between
    }

    #refreshBtn {
      margin-top: .5rem;
      margin-bottom: .5rem;
      margin-left: auto;
      margin-right: auto;
      width: 45%;
      border-radius: .25rem;
    }
  </style>
</head>

<body>
  <div class="shell">
    <!-- Left: Import + Export -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Actions</div>
            <h2 class="title">Import & Export</h2>
          </div>
        </div>
        <div class="panel-body">
          <!-- Import (file only) -->
          <div class="stack">
            <div class="eyebrow">Import DTCG</div>
            <div>
              <label>Choose a DTCG JSON file</label>
              <input id="file" type="file" accept=".json,application/json" />
            </div>
            <div class="row">
              <button id="importBtn" disabled>Import</button>
            </div>
            <div class="muted">Imports collections/modes as defined in the file.</div>
          </div>

          <!-- Export -->
          <div class="stack" style="border-top:1px solid var(--border);padding-top:12px;">
            <div class="eyebrow">Export DTCG</div>
            <div class="row-center">
              <label><input type="checkbox" id="exportAllChk" /> Export all collections & modes into a single
                file</label>

            </div>
            <div class="stack" id="exportPickers">
              <div>
                <label>Collection</label>
                <select id="collectionSelect"></select>
              </div>
              <div>
                <label>Mode (within collection)</label>
                <select id="modeSelect"></select>
              </div>
            </div>
            <div class="row">
              <button id="exportBtn" disabled>Export</button>
              <div class="muted">Select a collection and mode, or check \u201CExport all\u201D.</div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Middle: Raw Figma Collections -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Reference</div>
            <h2 class="title">Raw Figma Collections</h2>
          </div>
        </div>
        <div class="panel-body">
          <pre id="raw"></pre>
        </div>
        <button id="refreshBtn" style="background:#6b7280">Refresh</button>
      </div>
    </div>

    <!-- Right: Log -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Diagnostics</div>
            <h2 class="title">Log</h2>
          </div>
        </div>
        <div class="panel-body">
          <div id="log"></div>
        </div>
      </div>
    </div>
  </div>

  <script>"use strict";
(() => {
  // src/app/ui.ts
  var logEl = document.getElementById("log");
  var rawEl = document.getElementById("raw");
  var exportAllChk = document.getElementById("exportAllChk");
  var collectionSelect = document.getElementById("collectionSelect");
  var modeSelect = document.getElementById("modeSelect");
  var fileInput = document.getElementById("file");
  var importBtn = document.getElementById("importBtn");
  var exportBtn = document.getElementById("exportBtn");
  var exportPickers = document.getElementById("exportPickers");
  var refreshBtn = document.getElementById("refreshBtn");
  var currentCollections = [];
  function log(msg) {
    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    if (logEl && logEl instanceof HTMLElement) {
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  function postToPlugin(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  }
  function clearSelect(sel) {
    while (sel.options.length > 0) sel.remove(0);
  }
  function setDisabledStates() {
    if (importBtn && fileInput && importBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
      const hasFile = !!(fileInput.files && fileInput.files.length > 0);
      importBtn.disabled = !hasFile;
    }
    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers && exportBtn instanceof HTMLButtonElement && exportAllChk instanceof HTMLInputElement && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement && exportPickers instanceof HTMLElement) {
      const exportAll = !!exportAllChk.checked;
      if (exportAll) {
        exportBtn.disabled = false;
        exportPickers.style.opacity = "0.5";
      } else {
        exportPickers.style.opacity = "1";
        const hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;
        exportBtn.disabled = !hasSelection;
      }
    }
  }
  function populateCollections(data) {
    currentCollections = data.collections;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    clearSelect(collectionSelect);
    let i = 0;
    for (i = 0; i < data.collections.length; i++) {
      const c = data.collections[i];
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      collectionSelect.appendChild(opt);
    }
    onCollectionChange();
  }
  function onCollectionChange() {
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    const selected = collectionSelect.value;
    clearSelect(modeSelect);
    let i = 0;
    for (i = 0; i < currentCollections.length; i++) {
      const c = currentCollections[i];
      if (c.name === selected) {
        let j = 0;
        for (j = 0; j < c.modes.length; j++) {
          const m = c.modes[j];
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          modeSelect.appendChild(opt);
        }
        break;
      }
    }
    setDisabledStates();
  }
  function applyLastSelection(last) {
    if (!last) return;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    let i = 0;
    let found = false;
    for (i = 0; i < collectionSelect.options.length; i++) {
      if (collectionSelect.options[i].value === last.collection) {
        collectionSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    onCollectionChange();
    if (found) {
      let j = 0;
      for (j = 0; j < modeSelect.options.length; j++) {
        if (modeSelect.options[j].value === last.mode) {
          modeSelect.selectedIndex = j;
          break;
        }
      }
    }
    setDisabledStates();
  }
  function prettyJson(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_e) {
      return String(obj);
    }
  }
  if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {
    collectionSelect.addEventListener("change", function() {
      onCollectionChange();
      if (collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
    });
  }
  if (modeSelect && modeSelect instanceof HTMLSelectElement) {
    modeSelect.addEventListener("change", function() {
      if (collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
    });
  }
  if (fileInput && fileInput instanceof HTMLInputElement) {
    fileInput.addEventListener("change", setDisabledStates);
  }
  if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
    exportAllChk.addEventListener("change", function() {
      setDisabledStates();
      postToPlugin({ type: "SAVE_PREFS", payload: { exportAll: !!exportAllChk.checked } });
    });
  }
  if (refreshBtn && refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", function() {
      postToPlugin({ type: "FETCH_COLLECTIONS" });
    });
  }
  if (importBtn && importBtn instanceof HTMLButtonElement && fileInput && fileInput instanceof HTMLInputElement) {
    importBtn.addEventListener("click", function() {
      if (!fileInput.files || fileInput.files.length === 0) {
        log("Select a JSON file first.");
        return;
      }
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const text = String(reader.result);
          const json = JSON.parse(text);
          if (json && typeof json === "object" && !(json instanceof Array)) {
            postToPlugin({ type: "IMPORT_DTCG", payload: { json } });
            log("Import requested.");
          } else {
            log("Invalid JSON structure for tokens (expected an object).");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log("Failed to parse JSON: " + msg);
        }
      };
      reader.readAsText(fileInput.files[0]);
    });
  }
  if (exportBtn && exportBtn instanceof HTMLButtonElement) {
    exportBtn.addEventListener("click", function() {
      let exportAll = false;
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) exportAll = !!exportAllChk.checked;
      const payload = { exportAll };
      if (!exportAll && collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        payload.collection = collectionSelect.value;
        payload.mode = modeSelect.value;
        if (!(payload.collection && payload.mode)) {
          log('Pick collection and mode or use "Export all".');
          return;
        }
      }
      postToPlugin({ type: "EXPORT_DTCG", payload });
      if (exportAll) log("Export all requested.");
      else log('Export requested for "' + (payload.collection || "") + '" / "' + (payload.mode || "") + '".');
    });
  }
  window.onmessage = function(event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    let msg = null;
    if (data.pluginMessage && typeof data.pluginMessage === "object") {
      const maybe = data.pluginMessage;
      if (maybe && typeof maybe.type === "string") {
        msg = data.pluginMessage;
      }
    }
    if (!msg) return;
    if (msg.type === "ERROR") {
      log("ERROR: " + msg.payload.message);
      return;
    }
    if (msg.type === "INFO") {
      log(msg.payload.message);
      return;
    }
    if (msg.type === "EXPORT_RESULT") {
      let k = 0;
      for (k = 0; k < msg.payload.files.length; k++) {
        const f = msg.payload.files[k];
        const a = document.createElement("a");
        const blob = new Blob([prettyJson(f.json)], { type: "application/json" });
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.textContent = "Download " + f.name;
        const div = document.createElement("div");
        div.appendChild(a);
        if (logEl && logEl instanceof HTMLElement) logEl.appendChild(div);
      }
      log("Export ready.");
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      populateCollections({ collections: msg.payload.collections });
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
        exportAllChk.checked = !!msg.payload.exportAllPref;
      }
      applyLastSelection(msg.payload.last);
      setDisabledStates();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;
      return;
    }
  };
  document.addEventListener("DOMContentLoaded", function() {
    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = "Loading variable collections\\u2026";
    setDisabledStates();
    postToPlugin({ type: "UI_READY" });
  });
})();
//# sourceMappingURL=ui.js.map
<\/script>
</body>

</html>`, { width: 960, height: 540 });
  function send(msg) {
    figma.ui.postMessage(msg);
  }
  async function snapshotCollectionsForUi() {
    if (typeof figma.editorType !== "string" || figma.editorType !== "figma") {
      return {
        collections: [],
        rawText: "Variables API is not available in this editor.\nOpen a Figma Design file (not FigJam) and try again."
      };
    }
    if (typeof figma.variables === "undefined" || typeof figma.variables.getLocalVariableCollectionsAsync !== "function" || typeof figma.variables.getVariableByIdAsync !== "function") {
      return {
        collections: [],
        rawText: "Variables API methods not found. Ensure your Figma version supports Variables and try again."
      };
    }
    const locals = await figma.variables.getLocalVariableCollectionsAsync();
    const out = [];
    const rawLines = [];
    let i = 0;
    for (i = 0; i < locals.length; i++) {
      const c = locals[i];
      if (!c) continue;
      const modes = [];
      let mi = 0;
      for (mi = 0; mi < c.modes.length; mi++) {
        const m = c.modes[mi];
        modes.push({ id: m.modeId, name: m.name });
      }
      const varsList = [];
      let vi = 0;
      for (vi = 0; vi < c.variableIds.length; vi++) {
        const varId = c.variableIds[vi];
        const v = await figma.variables.getVariableByIdAsync(varId);
        if (!v) continue;
        varsList.push({ id: v.id, name: v.name, type: v.resolvedType });
      }
      out.push({ id: c.id, name: c.name, modes, variables: varsList });
      rawLines.push("Collection: " + c.name + " (" + c.id + ")");
      const modeNames = [];
      let zi = 0;
      for (zi = 0; zi < modes.length; zi++) modeNames.push(modes[zi].name);
      rawLines.push("  Modes: " + (modeNames.length > 0 ? modeNames.join(", ") : "(none)"));
      rawLines.push("  Variables (" + String(varsList.length) + "):");
      let qi = 0;
      for (qi = 0; qi < varsList.length; qi++) rawLines.push("    - " + varsList[qi].name + " [" + varsList[qi].type + "]");
      rawLines.push("");
    }
    if (out.length === 0) {
      rawLines.push("No local Variable Collections found.");
      rawLines.push("Create one in the Variables panel, then press Refresh.");
    }
    return { collections: out, rawText: rawLines.join("\n") };
  }
  function safeKeyFromCollectionAndMode(collectionName, modeName) {
    const base = collectionName + "/mode=" + modeName;
    let i = 0, out = "";
    for (i = 0; i < base.length; i++) {
      const ch = base.charAt(i);
      if (ch === "/" || ch === "\\" || ch === ":") out += "_";
      else out += ch;
    }
    return out;
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "UI_READY") {
        const snap = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "INFO", payload: { message: "Fetched " + String(snap.collections.length) + " collections (initial)" } });
        send({ type: "COLLECTIONS_DATA", payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
        return;
      }
      if (msg.type === "FETCH_COLLECTIONS") {
        const snapshot2 = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "INFO", payload: { message: "Fetched " + String(snapshot2.collections.length) + " collections" } });
        send({ type: "COLLECTIONS_DATA", payload: { collections: snapshot2.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snapshot2.rawText } });
        return;
      }
      if (msg.type === "IMPORT_DTCG") {
        await importDtcg(msg.payload.json);
        send({ type: "INFO", payload: { message: "Import completed." } });
        const snap2 = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "COLLECTIONS_DATA", payload: { collections: snap2.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap2.rawText } });
        return;
      }
      if (msg.type === "EXPORT_DTCG") {
        const exportAll = !!msg.payload.exportAll;
        if (exportAll) {
          const all = await exportDtcg({ format: "single" });
          send({ type: "EXPORT_RESULT", payload: { files: all.files } });
          return;
        }
        const collectionName = msg.payload.collection ? msg.payload.collection : "";
        const modeName = msg.payload.mode ? msg.payload.mode : "";
        const per = await exportDtcg({ format: "perMode" });
        const key = safeKeyFromCollectionAndMode(collectionName, modeName);
        const picked = [];
        let i2 = 0;
        for (i2 = 0; i2 < per.files.length; i2++) if (per.files[i2].name.indexOf(key) !== -1) picked.push(per.files[i2]);
        send({ type: "EXPORT_RESULT", payload: { files: picked.length > 0 ? picked : per.files } });
        return;
      }
      if (msg.type === "SAVE_LAST") {
        if (msg.payload && typeof msg.payload.collection === "string" && typeof msg.payload.mode === "string") {
          await figma.clientStorage.setAsync("lastSelection", { collection: msg.payload.collection, mode: msg.payload.mode });
        }
        return;
      }
      if (msg.type === "SAVE_PREFS") {
        await figma.clientStorage.setAsync("exportAllPref", !!msg.payload.exportAll);
        return;
      }
    } catch (e) {
      var message = "Unknown error";
      if (e && e.message) message = e.message;
      figma.notify("Plugin error: " + message, { timeout: 4e3 });
      send({ type: "ERROR", payload: { message } });
      console.error(e);
    }
  };
})();
//# sourceMappingURL=main.js.map
