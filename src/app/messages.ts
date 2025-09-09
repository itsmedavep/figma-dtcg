export type UiToPlugin =
  | { type: 'UI_READY' } // UI tells main it's ready to receive data
  | { type: 'FETCH_COLLECTIONS' }
  | { type: 'IMPORT_DTCG'; payload: { json: any } }
  | { type: 'EXPORT_DTCG'; payload: { exportAll: boolean; collection?: string; mode?: string } };

export type PluginToUi =
  | {
    type: 'COLLECTIONS_DATA'; payload: {
      collections: Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
      }>
    }
  }
  | { type: 'RAW_COLLECTIONS_TEXT'; payload: { text: string } }
  | { type: 'EXPORT_RESULT'; payload: { files: Array<{ name: string; json: any }> } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'INFO'; payload: { message: string } };
