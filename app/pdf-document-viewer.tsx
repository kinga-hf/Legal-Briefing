"use client";

import { ChevronLeft, ChevronRight, FileWarning, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export type PdfCitation = {
  pageNumber: number;
  quote: string;
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function containsCitationQuote(text: string, quote: string) {
  const textValue = normalizeText(text);
  const quoteWords = normalizeText(quote).split(" ").filter(Boolean);
  if (!textValue || quoteWords.length === 0) return false;

  const windowSize = Math.min(6, quoteWords.length);
  for (let index = 0; index <= quoteWords.length - windowSize; index += 1) {
    const phrase = quoteWords.slice(index, index + windowSize).join(" ");
    if (phrase.length > 12 && textValue.includes(phrase)) return true;
  }
  return false;
}

type PdfDocumentViewerProps = {
  file: File | string | null;
  fileName?: string;
  citation: PdfCitation | null;
  isLoading?: boolean;
};

export default function PdfDocumentViewer({ file, fileName, citation, isLoading = false }: PdfDocumentViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(560);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateWidth = () => setPageWidth(Math.max(260, viewer.clientWidth - 32));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setPageNumber(1);
      setPageCount(0);
      setLoadError("");
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [file]);

  useEffect(() => {
    if (!citation || pageCount === 0) return;
    const nextPage = Math.min(Math.max(citation.pageNumber, 1), pageCount);
    const updateId = window.setTimeout(() => {
      setPageNumber(nextPage);
      viewerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);

    return () => window.clearTimeout(updateId);
  }, [citation, pageCount]);

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-[#C5A059]/30 bg-[#001730]/70 p-6 text-center">
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#C5A059]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-200">Wczytywanie sprawy…</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Przywracamy oryginalny podgląd dokumentu PDF.</p>
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-[#C5A059]/30 bg-[#001730]/70 p-6 text-center">
        <div>
          <FileWarning className="mx-auto h-8 w-8 text-[#C5A059]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-200">Podgląd PDF pojawi się tutaj</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
            Wgraj plik PDF w strefie powyżej, aby przechodzić po stronach i otwierać cytowane fragmenty.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#C5A059]/30 bg-[#001730]">
      <div className="flex items-center justify-between border-b border-[#C5A059]/20 px-3 py-2">
        <span className="truncate text-xs text-slate-400" title={fileName || (typeof file === "string" ? file : file.name)}>{fileName || (typeof file === "string" ? "Oryginalny plik PDF" : file.name)}</span>
        <span className="ml-3 shrink-0 text-xs text-[#C5A059]">
          {pageCount > 0 ? `Strona ${pageNumber} / ${pageCount}` : "Ładowanie..."}
        </span>
      </div>

      <div ref={viewerRef} className="max-h-[620px] min-h-[360px] overflow-auto p-4">
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber((current) => Math.min(current, numPages));
          }}
          onLoadError={(error) => setLoadError(error.message || "Nie udało się otworzyć pliku PDF.")}
          loading={<p className="py-16 text-center text-sm text-slate-400">Ładowanie dokumentu...</p>}
          error={<p className="py-16 text-center text-sm text-red-200">{loadError || "Nie udało się otworzyć pliku PDF."}</p>}
        >
          {pageCount > 0 && (
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderTextLayer
              renderAnnotationLayer
              customTextRenderer={({ str }) =>
                citation && citation.pageNumber === pageNumber && containsCitationQuote(str, citation.quote) ? (
                  `<mark style="background:#C5A059;color:#001730;border-radius:3px;padding:0 2px">${escapeHtml(str)}</mark>`
                ) : (
                  str
                )
              }
            />
          )}
        </Document>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-[#C5A059]/20 px-3 py-2">
        <button
          type="button"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          className="rounded-md border border-[#C5A059]/30 p-1.5 text-[#C5A059] transition hover:border-[#C5A059] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Poprzednia strona"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="number"
          min={1}
          max={pageCount || 1}
          value={pageNumber}
          onChange={(event) => setPageNumber(Math.min(Math.max(Number(event.target.value) || 1, 1), pageCount || 1))}
          className="w-16 rounded-md border border-[#C5A059]/30 bg-[#002147] px-2 py-1.5 text-center text-xs text-slate-200 outline-none focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
          aria-label="Numer strony"
        />
        <button
          type="button"
          disabled={pageCount === 0 || pageNumber >= pageCount}
          onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
          className="rounded-md border border-[#C5A059]/30 p-1.5 text-[#C5A059] transition hover:border-[#C5A059] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Następna strona"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
