import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { apiError, checkRateLimit } from "../_safety";

export const runtime = "nodejs";

const maxFileSize = 15 * 1024 * 1024;

async function extractScannedPdfText(data: Uint8Array) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") return null;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: Buffer.from(data).toString("base64"),
            },
          },
          {
            text: "To jest skan dokumentu procesowego. Odczytaj cały możliwy tekst po polsku, zachowaj kolejność stron i nie dodawaj komentarzy ani streszczenia. Zwróć wyłącznie odczytany tekst.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "text/plain",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return response.text?.trim() || "";
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, "pdf");
  if (!rateLimit.allowed) {
    return apiError(
      "RATE_LIMIT",
      `Limit odczytu dokumentów został osiągnięty. Spróbuj ponownie za około ${Math.ceil(rateLimit.retryAfterSeconds / 60)} min.`,
      429,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("INVALID_FORM", "Nieprawidłowy formularz pliku.", 400);
  }

  const file = formData.get("file");

  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return apiError("MISSING_FILE", "Prześlij plik PDF w polu formularza o nazwie file.", 400);
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return apiError("UNSUPPORTED_FILE", "Obsługiwane są wyłącznie pliki PDF.", 415);
  }

  if (file.size > maxFileSize) {
    return apiError("FILE_TOO_LARGE", "Plik PDF jest zbyt duży. Maksymalny rozmiar to 15 MB.", 413);
  }

  let parser: { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } | undefined;
  try {
    // Ładujemy parser dopiero podczas żądania. Dzięki temu Vercel nie próbuje
    // inicjalizować pdf.js podczas samego ładowania funkcji serverless.
    const canvas = await import("@napi-rs/canvas");
    const runtimeGlobals = globalThis as Record<string, unknown>;
    runtimeGlobals.DOMMatrix ??= canvas.DOMMatrix;
    runtimeGlobals.ImageData ??= canvas.ImageData;
    runtimeGlobals.Path2D ??= canvas.Path2D;

    const { PDFParse } = await import("pdf-parse");
    const workerPathCandidates = [
      path.join(process.cwd(), "public/pdf.worker.mjs"),
      path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs"),
    ];
    const workerPath = workerPathCandidates.find((candidate) => fs.existsSync(candidate));
    if (!workerPath) {
      return apiError("PDF_WORKER_MISSING", "Nie udało się uruchomić modułu odczytu PDF. Spróbuj ponownie później.", 503);
    }
    PDFParse.setWorker(pathToFileURL(workerPath).toString());

    const data = new Uint8Array(await file.arrayBuffer());
    parser = new PDFParse({ data });
    const parsed = await parser.getText();
    let text = parsed.text.trim();
    let ocrUsed = false;

    if (!text) {
      const ocrText = await extractScannedPdfText(data);
      if (ocrText === null) {
        return apiError("OCR_UNAVAILABLE", "Nie można uruchomić OCR. Brak skonfigurowanego klucza usługi AI.", 503);
      }
      text = ocrText;
      ocrUsed = true;
    }

    if (!text) {
      return apiError(
        "NO_TEXT_IN_PDF",
        "Nie znaleziono tekstu w pliku PDF. Jeśli dokument jest skanem, potrzebne będzie OCR.",
        422,
      );
    }

    return NextResponse.json({ text, fileName: file.name, ocrUsed });
  } catch (error) {
    console.error("PDF extraction failed:", error);
    return apiError(
      "PDF_EXTRACTION_FAILED",
      "Nie udało się odczytać pliku PDF. Sprawdź, czy plik nie jest uszkodzony lub zabezpieczony hasłem.",
      422,
    );
  } finally {
    await parser?.destroy();
  }
}
