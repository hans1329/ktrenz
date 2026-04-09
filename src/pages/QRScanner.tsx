import { useState, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

// GS1 Application Identifier labels (Korean)
const GS1_AI_LABELS: Record<string, string> = {
  "00": "SSCC",
  "01": "GTIN",
  "02": "상품코드(포함)",
  "10": "배치/로트 번호",
  "11": "생산일",
  "12": "결제일",
  "13": "포장일",
  "15": "최적사용기한",
  "16": "판매기한",
  "17": "유통기한",
  "20": "제품 변형",
  "21": "일련번호",
  "22": "소비자용 제품 변형",
  "30": "수량",
  "37": "물류 단위 수량",
  "310": "순중량(kg)",
  "311": "길이(m)",
  "312": "너비(m)",
  "313": "높이(m)",
  "400": "주문 번호",
  "401": "위탁 번호",
  "402": "납기 번호",
  "403": "경로",
  "410": "납품지 GLN",
  "411": "청구지 GLN",
  "412": "구매자 GLN",
  "413": "최종 수취인 GLN",
  "414": "물리적 위치 GLN",
  "420": "우편번호(단일)",
  "421": "우편번호(국가포함)",
  "710": "NHRN(독일)",
  "711": "NHRN(프랑스)",
  "712": "NHRN(스페인)",
  "713": "NHRN(브라질)",
};

interface ParsedGS1 {
  ai: string;
  label: string;
  value: string;
}

function parseGS1(raw: string): ParsedGS1[] | null {
  // Check if it looks like a GS1 string: starts with (digits)
  if (!/^\(\d/.test(raw)) return null;

  const results: ParsedGS1[] = [];
  const regex = /\((\d{2,4})\)([^(]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    const ai = match[1];
    const value = match[2].trim();
    const label = GS1_AI_LABELS[ai] ?? `AI(${ai})`;
    results.push({ ai, label, value });
  }

  return results.length > 0 ? results : null;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function buildCanvas(img: HTMLImageElement, angleDeg: number, contrast: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = Math.round(img.width * cos + img.height * sin);
  const h = Math.round(img.width * sin + img.height * cos);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();

  // Apply contrast
  if (contrast !== 1) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
      data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
      data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

async function decodeFromCanvas(
  reader: BrowserMultiFormatReader,
  canvas: HTMLCanvasElement
): Promise<string> {
  const result = await reader.decodeFromCanvas(canvas);
  return result.getText();
}

async function tryDecodeWithPreprocessing(objectUrl: string): Promise<string> {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
  ]);
  const reader = new BrowserMultiFormatReader(hints);

  const img = await loadImageElement(objectUrl);

  // Try: (angle, contrast) combinations
  const attempts: Array<[number, number]> = [
    [0, 1],
    [2, 1],
    [-2, 1],
    [5, 1],
    [-5, 1],
    [10, 1],
    [-10, 1],
    [15, 1],
    [-15, 1],
    [20, 1],
    [-20, 1],
    [0, 1.3],
    [5, 1.3],
    [-5, 1.3],
    [10, 1.3],
    [-10, 1.3],
  ];

  for (const [angle, contrast] of attempts) {
    try {
      const canvas = buildCanvas(img, angle, contrast);
      const text = await decodeFromCanvas(reader, canvas);
      return text;
    } catch {
      // continue to next attempt
    }
  }

  throw new Error("QR 코드를 읽을 수 없습니다. 더 선명한 이미지를 사용해 주세요.");
}

export default function QRScanner() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [gs1Fields, setGs1Fields] = useState<ParsedGS1[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke old object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);
    setResult(null);
    setGs1Fields(null);
    setError(null);
  }

  async function handleDecode() {
    if (!objectUrlRef.current) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setGs1Fields(null);

    try {
      const text = await tryDecodeWithPreprocessing(objectUrlRef.current);
      setResult(text);
      setGs1Fields(parseGS1(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">QR / 바코드 스캐너</h1>
        <p className="text-sm text-gray-500">
          이미지를 업로드하면 기울어지거나 왜곡된 QR 코드도 자동으로 보정해 읽어드립니다.
        </p>

        {/* File input */}
        <div>
          <label
            htmlFor="qr-file"
            className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <span className="text-gray-400 text-sm">이미지 파일 선택 또는 카메라 촬영</span>
            <span className="text-gray-300 text-xs mt-1">JPG, PNG, WEBP 등</span>
          </label>
          <input
            id="qr-file"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Preview */}
        {previewUrl && (
          <div className="flex flex-col items-center space-y-3">
            <img
              src={previewUrl}
              alt="미리보기"
              className="max-h-60 rounded-lg border border-gray-200 object-contain"
            />
            <button
              onClick={handleDecode}
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "읽는 중..." : "QR 코드 읽기"}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1 font-medium">원본 값</p>
              <p className="text-sm text-gray-800 break-all font-mono">{result}</p>
            </div>

            {gs1Fields && gs1Fields.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-xs text-blue-400 mb-2 font-medium">GS1 파싱 결과</p>
                {gs1Fields.map(({ ai, label, value }) => (
                  <div key={ai} className="flex justify-between items-start gap-2">
                    <span className="text-xs text-blue-600 font-medium whitespace-nowrap">
                      ({ai}) {label}
                    </span>
                    <span className="text-sm text-gray-800 font-mono text-right break-all">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
