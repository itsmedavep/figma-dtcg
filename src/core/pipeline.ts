
import type { TokenGraph } from './ir';
import { normalize } from './normalize';
import { planChanges } from './plan';
import * as DtcgReader from '../adapters/dtcg-reader';
import * as DtcgWriter from '../adapters/dtcg-writer';
import * as FigmaReader from '../adapters/figma-reader';
import * as FigmaWriter from '../adapters/figma-writer';

export interface ImportOpts { collectionName: string; modeName: string }
export interface ExportOpts { format: 'single'|'perMode' }

export async function importDtcg(json: any, opts: ImportOpts) {
  const desiredGraph = normalize(DtcgReader.parse(json, { collectionName: opts.collectionName, modeName: opts.modeName }));
  const current = await FigmaReader.snapshot();
  const plan = planChanges(current, desiredGraph);
  await FigmaWriter.apply(plan);
}

export async function exportDtcg(opts: ExportOpts) {
  const current = await FigmaReader.snapshot();
  const graph = normalize(current);
  return DtcgWriter.serialize(graph, opts);
}
