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
  document.addEventListener("DOMContentLoaded", function() {
    parent.postMessage({ pluginMessage: { type: "UI_READY" } }, "*");
  });
  function log(msg) {
    var t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    var line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function postToPlugin(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  }
  function clearSelect(sel) {
    while (sel.options.length > 0) sel.remove(0);
  }
  function setDisabledStates() {
    if (importBtn && fileInput) {
      var hasFile = !!(fileInput.files && fileInput.files.length > 0);
      importBtn.disabled = !hasFile;
    }
    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers) {
      var exportAll = !!exportAllChk.checked;
      if (exportAll) {
        exportBtn.disabled = false;
        exportPickers.style.opacity = "0.5";
      } else {
        exportPickers.style.opacity = "1";
        var hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;
        exportBtn.disabled = !hasSelection;
      }
    }
  }
  function populateCollections(data) {
    if (!collectionSelect || !modeSelect) return;
    clearSelect(collectionSelect);
    var i;
    for (i = 0; i < data.collections.length; i++) {
      var c = data.collections[i];
      var opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      collectionSelect.appendChild(opt);
    }
    onCollectionChange(data);
  }
  function onCollectionChange(data) {
    if (!collectionSelect || !modeSelect) return;
    var selected = collectionSelect.value;
    clearSelect(modeSelect);
    var i;
    for (i = 0; i < data.collections.length; i++) {
      var c = data.collections[i];
      if (c.name === selected) {
        var j;
        for (j = 0; j < c.modes.length; j++) {
          var m = c.modes[j];
          var opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          modeSelect.appendChild(opt);
        }
        break;
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
  if (collectionSelect) collectionSelect.addEventListener("change", function() {
    postToPlugin({ type: "FETCH_COLLECTIONS" });
  });
  if (modeSelect) modeSelect.addEventListener("change", setDisabledStates);
  if (fileInput) fileInput.addEventListener("change", setDisabledStates);
  if (exportAllChk) exportAllChk.addEventListener("change", setDisabledStates);
  if (refreshBtn) refreshBtn.addEventListener("click", function() {
    postToPlugin({ type: "FETCH_COLLECTIONS" });
  });
  (function() {
    var importBtnEl = document.getElementById("importBtn");
    var fileInputEl0 = document.getElementById("file");
    if (importBtnEl instanceof HTMLButtonElement && fileInputEl0 instanceof HTMLInputElement) {
      const button = importBtnEl;
      const input = fileInputEl0;
      button.addEventListener("click", function() {
        if (!input.files || input.files.length === 0) {
          log("Select a JSON file first.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function() {
          try {
            var text = String(reader.result);
            var json = JSON.parse(text);
            postToPlugin({ type: "IMPORT_DTCG", payload: { json } });
            log("Import requested.");
          } catch (e) {
            var msg = e instanceof Error ? e.message : String(e);
            log("Failed to parse JSON: " + msg);
          }
        };
        reader.readAsText(input.files[0]);
      });
    }
  })();
  (function() {
    var exportBtnEl = document.getElementById("exportBtn");
    var exportAllEl = document.getElementById("exportAllChk");
    var collSelEl = document.getElementById("collectionSelect");
    var modeSelEl = document.getElementById("modeSelect");
    if (exportBtnEl instanceof HTMLButtonElement) {
      exportBtnEl.addEventListener("click", function() {
        var exportAll = !!(exportAllEl instanceof HTMLInputElement && exportAllEl.checked);
        var payload = { exportAll };
        if (!exportAll && collSelEl instanceof HTMLSelectElement && modeSelEl instanceof HTMLSelectElement) {
          payload.collection = collSelEl.value;
          payload.mode = modeSelEl.value;
          if (!(payload.collection && payload.mode)) {
            log('Pick collection and mode or use "Export all".');
            return;
          }
        }
        postToPlugin({ type: "EXPORT_DTCG", payload });
        if (exportAll) log("Export all requested.");
        else log('Export requested for "' + payload.collection + '" / "' + payload.mode + '".');
      });
    }
  })();
  window.onmessage = function(event) {
    var msg = event.data && event.data.pluginMessage ? event.data.pluginMessage : null;
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
      var k;
      for (k = 0; k < msg.payload.files.length; k++) {
        var f = msg.payload.files[k];
        var a = document.createElement("a");
        var blob = new Blob([prettyJson(f.json)], { type: "application/json" });
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.textContent = "Download " + f.name;
        var div = document.createElement("div");
        div.appendChild(a);
        logEl.appendChild(div);
      }
      log("Export ready.");
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      populateCollections({ collections: msg.payload.collections });
      setDisabledStates();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      rawEl.textContent = msg.payload.text;
      return;
    }
  };
  rawEl.textContent = "Loading variable collections\u2026";
  setDisabledStates();
  postToPlugin({ type: "UI_READY" });
})();
//# sourceMappingURL=ui.js.map
