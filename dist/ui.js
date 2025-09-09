"use strict";
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
  var shellEl = document.querySelector(".shell");
  var drawerToggleBtn = document.getElementById("drawerToggleBtn");
  var w3cPreviewEl = document.getElementById("w3cPreview");
  function postResize(width, height) {
    var w = Math.max(720, Math.min(1600, Math.floor(width)));
    var h = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });
  }
  function autoFitOnce() {
    var contentW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    var contentH = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var needsW = contentW > vw ? contentW : vw;
    var needsH = contentH > vh ? contentH : vh;
    if (needsW > vw || needsH > vh) {
      postResize(needsW, needsH);
    }
  }
  (function wireDragHandle() {
    var handle = document.getElementById("resizeHandle");
    if (!handle) return;
    var dragging = false;
    var startX = 0, startY = 0;
    var startW = 0, startH = 0;
    var raf = 0;
    var loggedOnce = false;
    function onMouseMove(e) {
      if (!dragging) return;
      if (raf) return;
      raf = window.requestAnimationFrame(function() {
        var _a, _b;
        raf = 0;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var targetW = startW + dx;
        var targetH = startH + dy;
        if (!loggedOnce) {
          loggedOnce = true;
          try {
            (_b = (_a = window.console) == null ? void 0 : _a.log) == null ? void 0 : _b.call(_a, "UI_RESIZE \u2192", targetW, targetH);
          } catch (_e) {
          }
        }
        postResize(targetW, targetH);
      });
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    handle.addEventListener("mousedown", function(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = window.innerWidth;
      startH = window.innerHeight;
      loggedOnce = false;
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });
  })();
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
  function requestPreviewForCurrent() {
    if (!(collectionSelect instanceof HTMLSelectElement) || !(modeSelect instanceof HTMLSelectElement)) return;
    const collection = collectionSelect.value || "";
    const mode = modeSelect.value || "";
    if (!collection || !mode) {
      if (w3cPreviewEl) w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";
      return;
    }
    postToPlugin({ type: "PREVIEW_REQUEST", payload: { collection, mode } });
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
  if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
    drawerToggleBtn.addEventListener("click", function() {
      var current = drawerToggleBtn.getAttribute("aria-expanded") === "true";
      setDrawerOpen(!current);
    });
  }
  if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {
    collectionSelect.addEventListener("change", function() {
      onCollectionChange();
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
        requestPreviewForCurrent();
      }
    });
  }
  if (modeSelect && modeSelect instanceof HTMLSelectElement) {
    modeSelect.addEventListener("change", function() {
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
      requestPreviewForCurrent();
    });
  }
  function setDrawerOpen(open) {
    if (shellEl && shellEl instanceof HTMLElement) {
      if (open) {
        shellEl.classList.remove("drawer-collapsed");
      } else {
        shellEl.classList.add("drawer-collapsed");
      }
    }
    if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
      drawerToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      drawerToggleBtn.textContent = open ? "Hide" : "Show";
      drawerToggleBtn.title = open ? "Hide log" : "Show log";
    }
    try {
      window.localStorage.setItem("drawerOpen", open ? "1" : "0");
    } catch (_e) {
    }
  }
  function getSavedDrawerOpen() {
    try {
      var v = window.localStorage.getItem("drawerOpen");
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (_e) {
    }
    return true;
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
      for (let k = 0; k < msg.payload.files.length; k++) {
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
    if (msg.type === "W3C_PREVIEW") {
      const header = `/* ${msg.payload.name} */
`;
      if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      populateCollections({ collections: msg.payload.collections });
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
        exportAllChk.checked = !!msg.payload.exportAllPref;
      }
      if (typeof msg.payload.drawerOpenPref === "boolean") {
        setDrawerOpen(msg.payload.drawerOpenPref);
      }
      applyLastSelection(msg.payload.last);
      setDisabledStates();
      requestPreviewForCurrent();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;
      return;
    }
  };
  document.addEventListener("DOMContentLoaded", function() {
    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = "Loading variable collections\u2026";
    setDisabledStates();
    setDrawerOpen(getSavedDrawerOpen());
    postToPlugin({ type: "UI_READY" });
    autoFitOnce();
  });
})();
//# sourceMappingURL=ui.js.map
