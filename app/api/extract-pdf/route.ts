import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { apiError } from "../_safety";

export const runtime = "nodejs";

const maxFileSize = 15 * 1024 * 1024;

export async function POST(request: Request) {
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
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(
      pathToFileURL(path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs")).toString(),
    );

    const data = new Uint8Array(await file.arrayBuffer());
    parser = new PDFParse({ data });
    const parsed = await parser.getText();
    const text = parsed.text.trim();

    if (!text) {
      return apiError(
        "NO_TEXT_IN_PDF",
        "Nie znaleziono tekstu w pliku PDF. Jeśli dokument jest skanem, potrzebne będzie OCR.",
        422,
      );
    }

    return NextResponse.json({ text, fileName: file.name });
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
