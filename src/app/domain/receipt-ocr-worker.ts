import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Chunk split: tesseract stays off the fill-up route until a scan runs.
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng');
    })();
  }
  return workerPromise;
}

/** On-device OCR via tesseract.js Worker. EN first; no API keys. */
export async function ocrReceiptImage(image: Blob | string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return data.text ?? '';
}

export async function disposeOcrWorker(): Promise<void> {
  if (!workerPromise) {
    return;
  }
  const w = await workerPromise;
  workerPromise = null;
  await w.terminate();
}
