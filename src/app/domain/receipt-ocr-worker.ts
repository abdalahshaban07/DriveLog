/**
 * On-device receipt OCR via PaddleOCR.js (PP-OCRv5).
 * Arabic recognition model also reads English. No API keys.
 * Chunk split: the SDK stays off the fill-up route until a scan runs.
 *
 * ponytail: WASM is loaded from the jsDelivr build of onnxruntime-web, and the
 * Arabic rec model from Paddle's official tar. First scan needs network.
 * Upgrade path: vendor `ort-wasm-simd-threaded.wasm` + the rec tar if those
 * hosts are blocked. `numThreads: 1` because GitHub Pages cannot send COOP/COEP.
 */

const ORT_VERSION = '1.30.0';
const WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ARABIC_REC_URL =
  'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/arabic_PP-OCRv5_mobile_rec_onnx_infer.tar';

type OcrLine = { text?: string };
type OcrEngine = {
  predict: (
    image: Blob,
    params?: {
      textDetLimitSideLen?: number;
      textDetLimitType?: 'min' | 'max';
      textDetMaxSideLimit?: number;
    },
  ) => Promise<Array<{ items?: OcrLine[] }>>;
  dispose: () => Promise<void> | void;
};

let enginePromise: Promise<OcrEngine> | null = null;

async function getEngine(): Promise<OcrEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      const engine = await PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textRecognitionModelName: 'arabic_PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: { url: ARABIC_REC_URL },
        ortOptions: {
          backend: 'wasm',
          wasmPaths: WASM_PATHS,
          numThreads: 1,
          simd: true,
        },
      });
      return engine as OcrEngine;
    })().catch((err: unknown) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

async function toBlob(image: Blob | string): Promise<Blob> {
  if (typeof image !== 'string') {
    return image;
  }
  const res = await fetch(image);
  if (!res.ok) {
    throw new Error('receipt image fetch failed');
  }
  return res.blob();
}

/** Read a receipt image. Lines joined with newlines for the existing parser. */
export async function ocrReceiptImage(image: Blob | string): Promise<string> {
  const engine = await getEngine();
  const [result] = await engine.predict(await toBlob(image), {
    textDetLimitSideLen: 960,
    textDetLimitType: 'max',
    textDetMaxSideLimit: 960,
  });
  return (result?.items ?? [])
    .map((item) => item.text?.trim() ?? '')
    .filter((line) => line.length > 0)
    .join('\n');
}

export async function disposeOcrWorker(): Promise<void> {
  if (!enginePromise) {
    return;
  }
  const engine = await enginePromise;
  enginePromise = null;
  await engine.dispose();
}
