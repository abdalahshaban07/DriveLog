/** Normalize part names for duplicate detection (decision 84A). */
export function normalizePartName(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[\s\-_./\\()'"]/g, '')
    .replace(/\u0640/g, ''); // Arabic tatweel
}

export function partNamesMatch(a: string, b: string): boolean {
  return normalizePartName(a) === normalizePartName(b);
}

/** System parts persist i18n keys (`parts.shockStrut`) in `otherLabel` / `name`. */
export function isStoredMessageKey(value: string): boolean {
  return value.startsWith('parts.') || value.startsWith('maintenance.');
}

type NamedPart = { id: string; labelKey?: string; name?: string };

export function partDefinitionLabel(part: NamedPart, t: (key: string) => string): string {
  if (part.labelKey) return t(part.labelKey);
  if (part.name && isStoredMessageKey(part.name)) return t(part.name);
  return part.name ?? part.id;
}

export function maintenanceRecordLabel(
  row: { type: string; otherLabel?: string; partDefinitionId?: string },
  catalog: readonly NamedPart[],
  t: (key: string) => string,
): string {
  if (row.partDefinitionId) {
    const part = catalog.find((p) => p.id === row.partDefinitionId);
    if (part) return partDefinitionLabel(part, t);
  }
  if (row.otherLabel) {
    return isStoredMessageKey(row.otherLabel) ? t(row.otherLabel) : row.otherLabel;
  }
  return t(`maintenance.type.${row.type}`);
}
