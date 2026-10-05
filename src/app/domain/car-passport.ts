import { downloadFile } from './export-history';
import type { Car, FillUp, Maintenance, VehicleDocument } from './models';
import {
  factGrid,
  ledgerCard,
  masthead,
  metricBand,
  pdfBlob,
  pdfDate,
  pdfNum,
  reportShell,
  richLine,
  sectionLabel,
  PDF,
  type PdfFact,
} from './pdf-theme';
import { fuelMonthCompare, latestEconomy, monthFuelSpend, rollingCostPerKm } from './economy';
import { daysUntilExpiry, docUrgency, nextExpiringDoc, type DocUrgency } from './vehicle-docs';

export type PassportCopy = {
  title: string;
  generatedPrefix: string;
  vehicle: string;
  odometer: string;
  economy: string;
  monthSpend: string;
  nextDoc: string;
  none: string;
  km: string;
  lPer100: string;
  currencyLabel: string;
  maintenance: string;
  maintEmpty: string;
  nextDocKind?: string;
  typeLabel: (type: string, otherLabel?: string) => string;
  plate?: string;
  year?: string;
  tank?: string;
  liters?: string;
  driven?: string;
  fills?: string;
  lastFill?: string;
  costPerKm?: string;
  /** `{days}` is filled with ASCII digits inside the PDF. */
  daysLeft?: string;
};

export type PassportData = {
  car: Car;
  fillUps: readonly FillUp[];
  documents: readonly VehicleDocument[];
  maintenance: readonly Maintenance[];
};

export type PassportView = {
  title: string;
  /** Make · model · year when it adds something the title does not already say. */
  spec: string;
  plate: string | null;
  /** Year chip only when the spec line is hidden. */
  showYear: boolean;
  year: string | null;
  tankLiters: number | null;
  odo: number;
  drivenKm: number;
  economy: number | null;
  monthSpend: number;
  /** Null when the previous month had no fuel spend. */
  monthDeltaPct: number | null;
  costPerKm: number | null;
  fillCount: number;
  lastFillDate: string | null;
  nextDoc: VehicleDocument | null;
  docDays: number | null;
  urgency: DocUrgency | null;
  lastService: Maintenance | null;
};

function dateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function latestDated<T extends { date: string; createdAt: string }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (
      !best ||
      row.date > best.date ||
      (row.date === best.date && row.createdAt > best.createdAt)
    ) {
      best = row;
    }
  }
  return best;
}

/** Nickname wins; spec line is omitted when it only repeats the title. */
export function vehicleIdentity(car: Car): { title: string; spec: string; showYear: boolean } {
  const nick = car.nickname.trim();
  const makeModel = [car.make, car.model]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ');
  const year = car.year?.trim() ?? '';
  const spec = [makeModel, year].filter((part) => part.length > 0).join(' · ');
  const title = nick || makeModel || year;
  const showSpec = spec.length > 0 && spec !== title && makeModel !== title;
  return {
    title,
    spec: showSpec ? spec : '',
    showYear: year.length > 0 && !showSpec && year !== title,
  };
}

export function buildPassportView(data: PassportData, now: Date = new Date()): PassportView {
  const today = dateOnlyLocal(now);
  const { car, fillUps, documents, maintenance } = data;
  const id = vehicleIdentity(car);
  const next = nextExpiringDoc(documents, today);
  const compare = fuelMonthCompare(fillUps, now);
  return {
    title: id.title,
    spec: id.spec,
    plate: car.plate?.trim() || null,
    showYear: id.showYear,
    year: car.year?.trim() || null,
    tankLiters: car.tankCapacityLiters ?? null,
    odo: car.currentOdometer,
    drivenKm: Math.max(0, car.currentOdometer - car.initialOdometer),
    economy: latestEconomy(fillUps)?.litersPer100Km ?? null,
    monthSpend: compare?.current ?? monthFuelSpend(fillUps, now),
    monthDeltaPct: compare?.deltaPct ?? null,
    costPerKm: rollingCostPerKm(fillUps, now),
    fillCount: fillUps.length,
    lastFillDate: latestDated(fillUps)?.date ?? null,
    nextDoc: next,
    docDays: next ? daysUntilExpiry(next.expiryDate, today) : null,
    urgency: next ? docUrgency(next.expiryDate, today) : null,
    lastService: latestDated(maintenance),
  };
}

/**
 * Eastern digits inside unit labels (e.g. ل/١٠٠) → ASCII so pdfmake-rtl
 * does not reverse them. Digits in the PDF always go through pdfNum / lineSpans.
 */
function unitAscii(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

function amount(n: number, digits: number, unit: string): string {
  const u = unitAscii(unit);
  return u ? `${pdfNum(n, digits)} ${u}` : pdfNum(n, digits);
}

function recentMaintenance(rows: readonly Maintenance[], limit = 12): Maintenance[] {
  return [...rows]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

function pushFact(
  facts: PdfFact[],
  label: string | undefined,
  value: string | null | undefined,
): void {
  if (label && value) {
    facts.push({ label, value });
  }
}

function monthValue(spend: number, delta: number | null, currency: string): string {
  const base = amount(spend, 2, currency);
  if (delta == null) {
    return base;
  }
  if (Math.abs(delta) < 3) {
    return `${base}  ~0%`;
  }
  const n = pdfNum(Math.abs(delta), 0);
  return `${base}  ${delta > 0 ? '+' : '-'}${n}%`;
}

/** Build Car Passport PDF (no VIN). Exported so tests can check layout. */
export function carPassportDoc(
  data: PassportData,
  copy: PassportCopy,
  opts: { rtl: boolean },
): Record<string, unknown> {
  const view = buildPassportView(data);
  const rtl = opts.rtl;
  const today = dateOnlyLocal(new Date());
  const headline = view.title || copy.title;
  const meta = [`${copy.generatedPrefix} ${today}`];
  if (view.spec) {
    meta.push(view.spec);
  }

  const metrics: PdfFact[] = [
    { label: copy.odometer, value: amount(view.odo, 0, copy.km) },
    {
      label: copy.economy,
      value: view.economy != null ? amount(view.economy, 1, copy.lPer100) : copy.none,
    },
    {
      label: copy.monthSpend,
      value: monthValue(view.monthSpend, view.monthDeltaPct, copy.currencyLabel),
    },
  ];
  if (copy.costPerKm) {
    metrics.push({
      label: copy.costPerKm,
      value: view.costPerKm != null ? amount(view.costPerKm, 2, copy.currencyLabel) : copy.none,
    });
  }

  const facts: PdfFact[] = [];
  pushFact(facts, copy.plate, view.plate);
  if (view.showYear) {
    pushFact(facts, copy.year, view.year);
  }
  if (view.tankLiters != null) {
    pushFact(facts, copy.tank, amount(view.tankLiters, 0, copy.liters ?? ''));
  }
  if (view.drivenKm > 0) {
    pushFact(facts, copy.driven, amount(view.drivenKm, 0, copy.km));
  }
  pushFact(facts, copy.fills, pdfNum(view.fillCount));
  if (view.lastFillDate) {
    pushFact(facts, copy.lastFill, pdfDate(view.lastFillDate));
  }
  if (view.nextDoc) {
    const kind = copy.nextDocKind ?? view.nextDoc.kind;
    const when = pdfDate(view.nextDoc.expiryDate);
    const days =
      view.docDays != null && view.docDays >= 0 && copy.daysLeft
        ? copy.daysLeft.replaceAll('{days}', pdfNum(view.docDays))
        : '';
    pushFact(facts, copy.nextDoc, [kind, when, days].filter(Boolean).join('  '));
  } else {
    pushFact(facts, copy.nextDoc, copy.none);
  }

  const content: Record<string, unknown>[] = [
    ...masthead(headline, meta, rtl, headline === copy.title ? undefined : copy.title),
    ...metricBand(metrics, rtl, 2),
  ];
  const grid = factGrid(facts, rtl);
  if (grid) {
    content.push(grid);
  }

  content.push(sectionLabel(copy.maintenance, rtl));
  const maint = recentMaintenance(data.maintenance);
  if (!maint.length) {
    content.push(
      richLine(copy.maintEmpty, rtl, { fontSize: 10, color: PDF.muted, margin: [0, 0, 0, 0] }),
    );
  } else {
    for (const row of maint) {
      const known = row.cost != null && Number.isFinite(row.cost);
      content.push(
        ledgerCard({
          rtl,
          kicker: pdfDate(row.date),
          title: copy.typeLabel(row.type, row.otherLabel),
          amount: known ? amount(row.cost ?? 0, 2, copy.currencyLabel) : copy.none,
          amountColor: known ? PDF.amber : PDF.muted,
          subtitle: amount(row.odometer, 0, copy.km),
          note: row.note ? { text: row.note } : undefined,
        }),
      );
    }
  }
  return reportShell(content, rtl);
}

export async function carPassportToPdf(
  data: PassportData,
  copy: PassportCopy,
  opts: { rtl: boolean },
): Promise<Blob> {
  return pdfBlob(carPassportDoc(data, copy, opts));
}

export { downloadFile, pdfDate, pdfNum, unitAscii };

export async function sharePassportPdf(file: File, title: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share !== 'function') {
    downloadFile(file);
    return false;
  }
  const shareData: ShareData = { files: [file], title };
  if (typeof nav.canShare === 'function' && !nav.canShare(shareData)) {
    downloadFile(file);
    return false;
  }
  await nav.share(shareData);
  return true;
}
