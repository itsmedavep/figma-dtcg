
import type { PluginToUi, UiToPlugin } from './messages';

const logEl = document.getElementById('log')!;
function log(msg: string) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// Import
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
importBtn.addEventListener('click', async () => {
  const fileInput = document.getElementById('file') as HTMLInputElement;
  const collection = (document.getElementById('collection') as HTMLInputElement).value.trim();
  const mode = (document.getElementById('mode') as HTMLInputElement).value.trim();
  if (!fileInput.files && fileInput.files[0]) return log('Please select a JSON file.');
  if (!collection || !mode) return log('Please provide collection and mode names.');
  try {
    const text = await fileInput.files[0].text();
    const json = JSON.parse(text);
    parent.postMessage({ pluginMessage: { type: 'IMPORT_DTCG', payload: { json, collection, mode } } as UiToPlugin }, '*');
    log('Sent import request to plugin.');
  } catch (e:any) {
    log('Failed to read JSON: ' + e?.message);
  }
});

// Export
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
exportBtn.addEventListener('click', () => {
  const fmt = (document.querySelector('input[name="fmt"]:checked') as HTMLInputElement).value as 'single'|'perMode';
  parent.postMessage({ pluginMessage: { type: 'EXPORT_DTCG', payload: { format: fmt } } as UiToPlugin }, '*');
  log('Requested export.');
});

// Receive messages from plugin
window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUi }>) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'ERROR') {
    log('ERROR: ' + msg.payload.message);
  } else if (msg.type === 'INFO') {
    log(msg.payload.message);
  } else if (msg.type === 'EXPORT_RESULT') {
    // Offer downloads
    for (const f of msg.payload.files) {
      const a = document.createElement('a');
      const blob = new Blob([JSON.stringify(f.json, null, 2)], { type: 'application/json' });
      a.href = URL.createObjectURL(blob);
      a.download = f.name;
      a.textContent = 'Download ' + f.name;
      const div = document.createElement('div');
      div.appendChild(a);
      logEl.appendChild(div);
    }
    log('Export ready.');
  }
};
