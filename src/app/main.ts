
import type { UiToPlugin, PluginToUi } from './messages';
import { importDtcg, exportDtcg } from '../core/pipeline';

figma.showUI(__html__, { width: 420, height: 520 });

function send(msg: PluginToUi) {
  figma.ui.postMessage(msg);
}

figma.ui.onmessage = async (msg: UiToPlugin) => {
  try {
    if (msg.type === 'IMPORT_DTCG') {
      const { json, collection, mode } = msg.payload;
      await importDtcg(json, { collectionName: collection, modeName: mode });
      send({ type: 'INFO', payload: { message: 'Import completed.' } });
    } else if (msg.type === 'EXPORT_DTCG') {
      const result = await exportDtcg({ format: msg.payload.format });
      send({ type: 'EXPORT_RESULT', payload: { files: result.files } });
    }
  } catch (e:any) {
    send({ type: 'ERROR', payload: { message: String(e?.message || e) } });
    console.error(e);
  }
};
