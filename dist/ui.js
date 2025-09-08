"use strict";
(() => {
  // src/app/ui.ts
  var logEl = document.getElementById("log");
  function log(msg) {
    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    logEl.textContent += `[${t}] ${msg}
`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  var importBtn = document.getElementById("importBtn");
  importBtn.addEventListener("click", async () => {
    const fileInput = document.getElementById("file");
    const collection = document.getElementById("collection").value.trim();
    const mode = document.getElementById("mode").value.trim();
    if (!fileInput.files && fileInput.files[0]) return log("Please select a JSON file.");
    if (!collection || !mode) return log("Please provide collection and mode names.");
    try {
      const text = await fileInput.files[0].text();
      const json = JSON.parse(text);
      parent.postMessage({ pluginMessage: { type: "IMPORT_DTCG", payload: { json, collection, mode } } }, "*");
      log("Sent import request to plugin.");
    } catch (e) {
      log("Failed to read JSON: " + (e == null ? void 0 : e.message));
    }
  });
  var exportBtn = document.getElementById("exportBtn");
  exportBtn.addEventListener("click", () => {
    const fmt = document.querySelector('input[name="fmt"]:checked').value;
    parent.postMessage({ pluginMessage: { type: "EXPORT_DTCG", payload: { format: fmt } } }, "*");
    log("Requested export.");
  });
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === "ERROR") {
      log("ERROR: " + msg.payload.message);
    } else if (msg.type === "INFO") {
      log(msg.payload.message);
    } else if (msg.type === "EXPORT_RESULT") {
      for (const f of msg.payload.files) {
        const a = document.createElement("a");
        const blob = new Blob([JSON.stringify(f.json, null, 2)], { type: "application/json" });
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.textContent = "Download " + f.name;
        const div = document.createElement("div");
        div.appendChild(a);
        logEl.appendChild(div);
      }
      log("Export ready.");
    }
  };
})();
//# sourceMappingURL=ui.js.map
