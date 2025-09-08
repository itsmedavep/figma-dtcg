
export type UiToPlugin =
  | { type: 'IMPORT_DTCG'; payload: { json: any; collection: string; mode: string } }
  | { type: 'EXPORT_DTCG'; payload: { format: 'single' | 'perMode' } };

export type PluginToUi =
  | { type: 'EXPORT_RESULT'; payload: { files: Array<{ name: string; json: any }> } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'INFO'; payload: { message: string } };
