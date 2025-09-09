// src/app/messages.ts

// ==== UI -> Plugin ====

// UI → Plugin
export type UiToPlugin =
  | { type: 'UI_READY' }
  | { type: 'FETCH_COLLECTIONS' }
  | { type: 'IMPORT_DTCG'; payload: { json: unknown } }
  | { type: 'EXPORT_DTCG'; payload: { exportAll: boolean; collection?: string; mode?: string } }
  | { type: 'SAVE_LAST'; payload: { collection: string; mode: string } }
  | { type: 'SAVE_PREFS'; payload: { exportAll: boolean } }
  | { type: 'UI_RESIZE'; payload: { width: number; height: number } }   // <-- added
  | { type: 'PREVIEW_REQUEST'; payload: { collection: string; mode: string } };


// ==== Plugin -> UI ====

export type PluginToUi =
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'INFO'; payload: { message: string } }
  | {
    type: 'COLLECTIONS_DATA';
    payload: {
      collections: Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
      }>;
      last: { collection: string; mode: string } | null;
      exportAllPref: boolean;
    };
  }
  | { type: 'RAW_COLLECTIONS_TEXT'; payload: { text: string } }
  | { type: 'EXPORT_RESULT'; payload: { files: Array<{ name: string; json: unknown }> } }
  | { type: 'W3C_PREVIEW'; payload: { name: string; json: unknown } };
