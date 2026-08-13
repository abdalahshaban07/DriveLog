import { MAINTENANCE_TYPES, type Maintenance } from './models';

export function optionalText(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const s = String(raw).trim();
  return s ? s : undefined;
}

export function optionalNumber(raw: unknown): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeCustomTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = optionalText(item);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type AddCustomTypeResult =
  | { ok: true; name: string; list: string[] }
  | { ok: false; reason: 'empty' | 'duplicate' };

export function addCustomMaintenanceType(
  list: readonly string[],
  rawName: string,
): AddCustomTypeResult {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, reason: 'empty' };
  }
  const key = name.toLowerCase();
  if (MAINTENANCE_TYPES.some((t) => t === key) || list.some((x) => x.toLowerCase() === key)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, name, list: [...list, name] };
}

/** Null when both empty so a typed total is left alone. */
export function costFromPartLabor(partRaw: string, laborRaw: string): string | null {
  if (partRaw === '' && laborRaw === '') {
    return null;
  }
  return String((Number(partRaw) || 0) + (Number(laborRaw) || 0));
}

export function maintenanceDetailFields(raw: {
  centerName?: unknown;
  technicianName?: unknown;
  partBrand?: unknown;
  partCost?: unknown;
  laborCost?: unknown;
  otherLabel?: unknown;
  type?: unknown;
}): Pick<
  Maintenance,
  | 'centerName'
  | 'technicianName'
  | 'partBrand'
  | 'partCost'
  | 'laborCost'
  | 'otherLabel'
> {
  return {
    centerName: optionalText(raw.centerName),
    technicianName: optionalText(raw.technicianName),
    partBrand: optionalText(raw.partBrand),
    partCost: optionalNumber(raw.partCost),
    laborCost: optionalNumber(raw.laborCost),
    otherLabel: raw.type === 'other' ? optionalText(raw.otherLabel) : undefined,
  };
}
