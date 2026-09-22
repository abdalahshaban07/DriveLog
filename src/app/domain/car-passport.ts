import { downloadFile } from './export-history';
import type { Car, FillUp, VehicleDocument } from './models';
import { latestEconomy, monthFuelSpend } from './economy';
import { nextExpiringDoc } from './vehicle-docs';

export type PassportCopy = {
  title: string;
  generated: string;
  vehicle: string;
  odometer: string;
  economy: string;
  monthSpend: string;
  nextDoc: string;
  none: string;
};

export type PassportData = {
  car: Car;
  fillUps: readonly FillUp[];
  documents: readonly VehicleDocument[];
  formatMoney: (n: number) => string;
  formatUnit: (n: number) => string;
  formatDate: (d: string) => string;
  formatNumber: (n: number) => string;
};

type PdfMakeApi = {
  addVirtualFileSystem?: (vfs: unknown) => void;
  vfs?: unknown;
  fonts?: Record<string, unknown>;
  createPdf: (doc: unknown) => {
    getBlob: () => Promise<Blob>;
    getBuffer?: () => Promise<Uint8Array | ArrayBuffer>;
  };
};

async function getPdfMake(): Promise<PdfMakeApi> {
  const [{ default: pdfMake }, { default: pdfVfs }] = await Promise.all([
    import('pdfmake-rtl/build/pdfmake'),
    import('pdfmake-rtl/build/vfs_fonts'),
  ]);
  const pdf = pdfMake as unknown as PdfMakeApi;
  if (typeof pdf.addVirtualFileSystem === 'function') {
    pdf.addVirtualFileSystem(pdfVfs);
  } else {
    pdf.vfs = pdfVfs;
  }
  pdf.fonts = {
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
    Cairo: {
      normal: 'Cairo-Regular.ttf',
      bold: 'Cairo-Bold.ttf',
      italics: 'Cairo-Regular.ttf',
      bolditalics: 'Cairo-Bold.ttf',
    },
  };
  return pdf;
}

/** Build a one-page Car Passport PDF (no VIN). */
export async function carPassportToPdf(
  data: PassportData,
  copy: PassportCopy,
  opts: { rtl: boolean },
): Promise<Blob> {
  const eco = latestEconomy(data.fillUps);
  const month = monthFuelSpend(data.fillUps);
  const nextDoc = nextExpiringDoc(data.documents);
  const pdf = await getPdfMake();
  const font = opts.rtl ? 'Cairo' : 'Roboto';
  const align = opts.rtl ? 'right' : 'left';

  const lines: { label: string; value: string }[] = [
    {
      label: copy.vehicle,
      value: [data.car.nickname, data.car.make, data.car.model, data.car.year]
        .filter(Boolean)
        .join(' · '),
    },
    {
      label: copy.odometer,
      value: `${data.formatNumber(data.car.currentOdometer)} km`,
    },
    {
      label: copy.economy,
      value: eco ? data.formatUnit(eco.litersPer100Km) : copy.none,
    },
    {
      label: copy.monthSpend,
      value: data.formatMoney(month),
    },
    {
      label: copy.nextDoc,
      value: nextDoc
        ? `${nextDoc.kind} · ${data.formatDate(nextDoc.expiryDate)}`
        : copy.none,
    },
  ];

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    ...(opts.rtl ? { rtl: true } : {}),
    defaultStyle: { font, fontSize: 12, alignment: align, color: '#1a1f24' },
    content: [
      {
        text: copy.title,
        fontSize: 22,
        bold: true,
        margin: [0, 0, 0, 4],
      },
      {
        text: copy.generated,
        fontSize: 10,
        color: '#667788',
        margin: [0, 0, 0, 24],
      },
      ...lines.map((row) => ({
        columns: [
          { text: row.label, width: '35%', color: '#667788', fontSize: 11 },
          { text: row.value, width: '*', bold: true },
        ],
        margin: [0, 0, 0, 14],
      })),
    ],
  };

  const doc = pdf.createPdf(docDefinition);
  if (typeof doc.getBlob === 'function') {
    return doc.getBlob();
  }
  const buffer = await doc.getBuffer!();
  return new Blob([buffer as BlobPart], { type: 'application/pdf' });
}

export { downloadFile };

export async function sharePassportPdf(file: File, title: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share !== 'function') {
    downloadFile(file);
    return false;
  }
  const data: ShareData = { files: [file], title };
  if (typeof nav.canShare === 'function' && !nav.canShare(data)) {
    downloadFile(file);
    return false;
  }
  await nav.share(data);
  return true;
}
