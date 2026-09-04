import type { Car, FillUp, Maintenance } from './models';

export type SetupChecklistDraft = {
  id: 'car' | 'fill' | 'due';
  done: boolean;
};

const SAMPLE_ID_PREFIX = 'sample-';

export function isRealFillUp(fill: FillUp): boolean {
  return !fill.id.startsWith(SAMPLE_ID_PREFIX);
}

/** Derive setup checklist completion from db state (pure). */
export function buildSetupChecklist(input: {
  car: Car | null | undefined;
  fills: readonly FillUp[];
  maintenance: readonly Maintenance[];
}): SetupChecklistDraft[] {
  const hasDue = input.maintenance.some((m) => m.dueDate != null || m.dueKm != null);
  return [
    { id: 'car', done: !!input.car },
    { id: 'fill', done: input.fills.some(isRealFillUp) },
    { id: 'due', done: hasDue },
  ];
}

export function shouldShowSetupChecklist(input: {
  sampleMode: boolean;
  checklistDismissed: boolean;
  items: readonly SetupChecklistDraft[];
}): boolean {
  if (input.sampleMode || input.checklistDismissed) {
    return false;
  }
  return input.items.some((i) => !i.done);
}
