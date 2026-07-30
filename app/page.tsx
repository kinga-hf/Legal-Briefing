"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Gavel,
  Loader2,
  ListChecks,
  LogOut,
  MessageCircle,
  Scale,
  Sparkles,
  Send,
  Smartphone,
  Trash2,
  User,
  Upload,
} from "lucide-react";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { useBriefing } from "./briefing-context";
import type { PdfCitation } from "./pdf-document-viewer";
import CourtCardModal, { type CourtCardData } from "./court-card-modal";
import { createClient } from "../lib/supabase/client";
import { useRouter } from "next/navigation";

const PdfDocumentViewer = dynamic(() => import("./pdf-document-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-[#C5A059]/30 bg-[#001730] p-6 text-sm text-slate-400">
      Ładowanie podglądu PDF…
    </div>
  ),
});

type Zarzut = {
  typ: "Formalny" | "Materialny";
  nazwa: string;
  opis: string;
  kontrargument: string;
};

type WniosekProcesowy = {
  wniosek: string;
  cel: string;
  odnosniki: PdfCitation[];
};

type ZarzutWithCitations = Zarzut & { odnosniki: PdfCitation[] };

type AnalysisResult = {
  glowne_tezy: string;
  glowne_tezy_odnosniki: PdfCitation[];
  zarzuty: ZarzutWithCitations[];
  wnioski_procesowe: WniosekProcesowy[];
  checklista: Array<{
    zadanie: string;
    uzasadnienie: string;
    odnosniki: PdfCitation[];
  }>;
  courtCard?: CourtCardData;
};

type SavedCase = {
  id: string;
  title: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  analysis: AnalysisResult | null;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

type ChatPersona = "Strateg Procesowy" | "Adwokat Diabła" | "Legal Design";

const documentTypes = [
  "Sprzeciw od nakazu zapłaty",
  "Odpowiedź na pozew",
  "Pismo przygotowawcze",
  "Apelacja",
  "Zażalenie",
  "Inne pismo procesowe",
];

const initialChatMessage: ChatMessage = {
  role: "model",
  text: "Dzień dobry! To jest podstawowy czat prawniczy. Napisz wiadomość, a odpowiem w zwykłej rozmowie.",
};

const smartSuggestions = [
  { label: "Przetłumacz na prosty język dla klienta", query: "Przetłumacz na prosty język dla klienta" },
  {
    label: "👥 Pytania do świadków",
    query:
      "Na podstawie treści pisma przeciwnika przygotuj listę sugerowanych pytań do przesłuchania świadków oraz stron. Podziel pytania na grupy tematyczne i wskaż, jaki fakt procesowy ma wykazać każde z nich.",
  },
  {
    label: "📅 Terminy i rygory",
    query:
      "Wypisz z pisma wszystkie terminy procesowe, daty zdarzeń, ustawowe terminy na odpowiedź/zaskarżenie oraz ewentualne rygory formalne. Wyświetl je w formie czytelnej chronologicznej listy.",
  },
  {
    label: "💰 Wyciągnij kwoty i roszczenia",
    query:
      "Wyciągnij z tego pisma wszystkie kwoty, roszczenia główne, odsetki i koszty. Przedstaw je w przejrzystej tabeli z podziałem na rodzaj roszczenia, kwotę i podstawę.",
  },
  {
    label: "🆔 Znajdź PESEL / KRS / NIP",
    query:
      "Wypisz z dokumentu wszystkie dane identyfikacyjne podmiotów i osób: numery PESEL, KRS, NIP, REGON, adresy oraz imiona i nazwiska stron/reprezentantów.",
  },
  {
    label: "⚠️ Znajdź sprzeczności w piśmie",
    query:
      "Przeanalizuj pismo pod kątem sprzeczności, rozbieżności w twierdzeniach oraz błędów logicznych. Wskaż fragmenty, w których przeciwnik przeczy sam sobie lub załączonym dowodom.",
  },
  {
    label: "⚖️ Ocena siły argumentów",
    query:
      "Dokonaj oceny silnych i słabych stron argumentacji przeciwnika. Wskaż, które twierdzenia są dobrze uzasadnione, a które są gołosłowne i łatwe do podważenia.",
  },
];

const personaOptions: Array<{ value: ChatPersona; description: string }> = [
  { value: "Strateg Procesowy", description: "procedura i taktyka" },
  { value: "Adwokat Diabła", description: "krytyka i słabe punkty" },
  { value: "Legal Design", description: "prosty język dla klienta" },
];

type FormalChatPersona =
  | "Analiza Taktyczna i Proceduralna"
  | "Krytyczna Ocena Ryzyka (Słabe Punkty)"
  | "Podsumowanie dla Klienta (Plain Language)";

void personaOptions;

const formalPersonaOptions: Array<{ value: FormalChatPersona; description: string }> = [
  { value: "Analiza Taktyczna i Proceduralna", description: "procedura i taktyka" },
  { value: "Krytyczna Ocena Ryzyka (Słabe Punkty)", description: "krytyka i słabe punkty" },
  { value: "Podsumowanie dla Klienta (Plain Language)", description: "prosty język dla klienta" },
];

const CLIENT_REQUEST_TIMEOUT_MS = 30_000;
const CLIENT_ANALYSIS_TIMEOUT_MS = 300_000;
const PUBLIC_TEST_MODE = true;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = CLIENT_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new Error("Zapytanie trwało zbyt długo. Spróbuj ponownie lub skróć dokument.");
    }
    throw new Error("Wystąpił problem z połączeniem. Sprawdź internet i spróbuj ponownie.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readApiResponse<T>(response: Response, fallbackMessage: string) {
  const payload = (await response.json().catch(() => null)) as
    | { userMessage?: unknown; error?: unknown }
    | null;

  if (!response.ok) {
    const message =
      typeof payload?.userMessage === "string"
        ? payload.userMessage
        : typeof payload?.error === "string"
          ? payload.error
          : fallbackMessage;
    throw new Error(message);
  }

  return payload as T;
}

async function createCaseRecord(payload: {
  title: string;
  documentType: string;
  fileName: string;
  documentText: string;
  context: string;
  fileUrl?: string | null;
  analysis?: AnalysisResult | null;
}) {
  const response = await fetchWithTimeout("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await readApiResponse<{ case?: { id: string } }>(response, "Nie udało się zapisać sprawy.");
  if (!result.case?.id) throw new Error("Sprawa nie została zapisana.");
  return result.case.id;
}

async function uploadPdfToStorage(supabase: ReturnType<typeof createClient>, file: File) {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Zaloguj się, aby zapisać oryginalny plik PDF.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("case-files").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  if (error) throw new Error("Nie udało się zapisać oryginalnego pliku PDF w Storage.");

  const { data } = supabase.storage.from("case-files").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Nie udało się uzyskać adresu pliku PDF.");
  return data.publicUrl;
}

async function saveCaseMessage(caseId: string, message: ChatMessage) {
  const response = await fetchWithTimeout(`/api/cases/${caseId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  await readApiResponse(response, "Nie udało się zapisać historii czatu.");
}

function CitationPills({
  citations,
  onSelect,
}: {
  citations: PdfCitation[];
  onSelect: (citation: PdfCitation) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <div className="no-print mt-3 flex flex-wrap gap-2">
      {citations.map((citation, index) => (
        <button
          key={`${citation.pageNumber}-${index}`}
          type="button"
          onClick={() => onSelect(citation)}
          title={citation.quote}
          className="rounded-full border border-[#C5A059]/50 bg-[#001730] px-2.5 py-1 text-[11px] font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#001730]"
        >
          [Strona {citation.pageNumber}]
        </button>
      ))}
    </div>
  );
}


type PdfMakeApi = {
  vfs?: Record<string, string>;
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  createPdf: (documentDefinition: TDocumentDefinitions) => {
    download: (filename: string) => void;
  };
};

function cleanPdfText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function getPdfMake() {
  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as unknown as PdfMakeApi;
  const pdfFonts = (pdfFontsModule.default ?? pdfFontsModule) as unknown as Record<string, string> | { vfs: Record<string, string> };
  const virtualFileSystem = ("vfs" in pdfFonts ? pdfFonts.vfs : pdfFonts) as Record<string, string>;
  if (pdfMake.addVirtualFileSystem) {
    pdfMake.addVirtualFileSystem(virtualFileSystem);
  } else {
    pdfMake.vfs = virtualFileSystem;
  }
  return pdfMake;
}

function pdfDocumentBase(title: string): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [56, 54, 56, 54],
    defaultStyle: {
      font: "Roboto",
      fontSize: 10.5,
      color: "#111111",
      lineHeight: 1.35,
    },
    header: {
      text: "LITIGATION BRIEFING TOOL - RAPORT",
      alignment: "center",
      margin: [56, 24, 56, 0],
      fontSize: 8,
      bold: true,
      characterSpacing: 1.2,
      color: "#555555",
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Legal Opposition Summarizer", alignment: "left" },
        { text: `${currentPage}/${pageCount}`, alignment: "right" },
      ],
      margin: [56, 12, 56, 0],
      fontSize: 8,
      color: "#666666",
    }),
    content: [
      { text: title, style: "documentTitle" },
    ],
    styles: {
      documentTitle: {
        fontSize: 17,
        bold: true,
        alignment: "center",
        margin: [0, 12, 0, 20],
        color: "#000000",
      },
      documentMeta: {
        fontSize: 9,
        color: "#555555",
        margin: [0, 0, 0, 16],
      },
      sectionTitle: {
        fontSize: 12,
        bold: true,
        color: "#000000",
        margin: [0, 16, 0, 6],
        decoration: "underline",
      },
      itemTitle: {
        fontSize: 11,
        bold: true,
        color: "#000000",
        margin: [0, 8, 0, 3],
      },
      label: {
        fontSize: 9,
        bold: true,
        color: "#333333",
      },
      bodyText: {
        fontSize: 10.5,
        color: "#111111",
        alignment: "justify",
        margin: [0, 0, 0, 7],
      },
    },
  };
}

async function downloadAnalysisPDF(result: AnalysisResult, documentType: string) {
  try {
    const pdfMake = await getPdfMake();
    const definition = pdfDocumentBase("Analiza pisma procesowego");
    const content = definition.content as Content[];

    content.push({ text: `Typ dokumentu: ${cleanPdfText(documentType)}`, style: "documentMeta" });
    content.push({ text: "GŁÓWNE TEZY", style: "sectionTitle" });
    content.push({ text: cleanPdfText(result.glowne_tezy), style: "bodyText" });

    content.push({ text: "ZARZUTY", style: "sectionTitle" });
    if (result.zarzuty.length === 0) {
      content.push({ text: "Nie zidentyfikowano wyraźnych zarzutów.", style: "bodyText" });
    } else {
      result.zarzuty.forEach((zarzut, index) => {
        content.push({
          text: `${index + 1}. ${cleanPdfText(zarzut.nazwa)}`,
          style: "itemTitle",
        });
        content.push({
          text: [
            { text: "Typ zarzutu: ", style: "label" },
            cleanPdfText(zarzut.typ),
          ],
          style: "bodyText",
        });
        content.push({
          text: [
            { text: "Opis: ", style: "label" },
            cleanPdfText(zarzut.opis),
          ],
          style: "bodyText",
        });
        content.push({
          text: [
            { text: "Kontrargument: ", style: "label" },
            cleanPdfText(zarzut.kontrargument),
          ],
          style: "bodyText",
        });
      });
    }

    content.push({ text: "WNIOSKI PROCESOWE", style: "sectionTitle" });
    if (result.wnioski_procesowe.length === 0) {
      content.push({ text: "Nie zaproponowano dodatkowych wniosków.", style: "bodyText" });
    } else {
      result.wnioski_procesowe.forEach((wniosek, index) => {
        content.push({
          text: `${index + 1}. ${cleanPdfText(wniosek.wniosek)}`,
          style: "itemTitle",
        });
        content.push({
          text: [
            { text: "Cel procesowy: ", style: "label" },
            cleanPdfText(wniosek.cel),
          ],
          style: "bodyText",
        });
      });
    }

    const date = new Date().toISOString().slice(0, 10);
    pdfMake.createPdf(definition).download(`Analiza_Procesowa_${date}.pdf`);
  } catch (error) {
    console.error("Nie udało się wygenerować raportu PDF", error);
    window.alert("Nie udało się wygenerować raportu PDF. Spróbuj ponownie.");
  }
}

async function downloadChatPDF(messages: ChatMessage[], documentLabel: string) {
  try {
    const pdfMake = await getPdfMake();
    const definition = pdfDocumentBase("Czat prawniczy");
    const content = definition.content as Content[];
    content.push({ text: `Analizowane pismo: ${cleanPdfText(documentLabel)}`, style: "documentMeta" });

    messages.forEach((message, index) => {
      content.push({
        text: `${message.role === "user" ? "Użytkownik" : "Asystent"} - wiadomość ${index + 1}`,
        style: "itemTitle",
      });
      content.push({ text: cleanPdfText(message.text), style: "bodyText" });
    });

    const date = new Date().toISOString().slice(0, 10);
    pdfMake.createPdf(definition).download(`Czat_Prawniczy_${date}.pdf`);
  } catch (error) {
    console.error("Nie udało się wygenerować raportu PDF", error);
    window.alert("Nie udało się wygenerować raportu PDF. Spróbuj ponownie.");
  }
}

function ChatPanel() {
  const { caseId, setCaseId, text: documentText, documentType, fileName } = useBriefing();
  const [messages, setMessages] = useState<ChatMessage[]>([initialChatMessage]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [persona, setPersona] = useState<FormalChatPersona>("Analiza Taktyczna i Proceduralna");

  useEffect(() => {
    if (!caseId) return;
    let isMounted = true;

    void fetchWithTimeout(`/api/cases/${caseId}/messages`)
      .then((response) => readApiResponse<{ messages?: ChatMessage[] }>(response, "Nie udało się pobrać historii czatu."))
      .then((payload) => {
        if (!isMounted) return;
        setMessages(payload.messages?.length ? payload.messages : [initialChatMessage]);
      })
      .catch((historyError) => {
        if (isMounted) setError(historyError instanceof Error ? historyError.message : "Nie udało się pobrać historii czatu.");
      });

    return () => {
      isMounted = false;
    };
  }, [caseId]);

  const sendChatMessage = async (message: string) => {
    const trimmedDraft = message.trim();
    if (!trimmedDraft || isSending) return;

    const userMessage: ChatMessage = { role: "user", text: trimmedDraft };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetchWithTimeout("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          persona,
          documentText,
          documentType,
          documentName: fileName,
        }),
      });
      const payload = await readApiResponse<{ message?: string }>(
        response,
        "Nie udało się wysłać wiadomości. Spróbuj ponownie.",
      );
      if (!payload?.message) {
        throw new Error("Asystent AI nie zwrócił odpowiedzi. Spróbuj ponownie.");
      }

      setMessages([...nextMessages, { role: "model", text: payload.message }]);

      if (!PUBLIC_TEST_MODE) {
      try {
        const activeCaseId = caseId ?? await createCaseRecord({
          title: fileName || documentType || "Nowa sprawa",
          documentType,
          fileName,
          documentText,
          context: "",
        });
        await saveCaseMessage(activeCaseId, userMessage);
        await saveCaseMessage(activeCaseId, { role: "model", text: payload.message });
        if (!caseId) setCaseId(activeCaseId);
      } catch (saveError) {
        setError(saveError instanceof Error ? `Odpowiedź jest gotowa, ale nie zapisano historii: ${saveError.message}` : "Odpowiedź jest gotowa, ale nie zapisano historii czatu.");
      }
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Nie udało się wysłać wiadomości. Spróbuj ponownie.");
    } finally {
      setIsSending(false);
    }
  };

  const clearChatHistory = async () => {
    if (isSending) return;
    if (!window.confirm("Czy na pewno usunąć historię tej rozmowy?")) return;

    setError("");
    try {
      if (caseId) {
        const response = await fetchWithTimeout(`/api/cases/${caseId}/messages`, { method: "DELETE" });
        await readApiResponse(response, "Nie udało się usunąć historii czatu.");
      }
      setMessages([initialChatMessage]);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Nie udało się usunąć historii czatu.");
    }
  };

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendChatMessage(draft);
  };

  const documentLabel = documentText.trim() ? fileName || documentType : "Brak wgranego pisma";

  return (
    <section id="chat-report-container" className="print-report rounded-xl border border-[#C5A059]/30 bg-[#001730] p-5 shadow-2xl shadow-black/20 sm:p-7">
      <div className="mb-4 border-b border-[#C5A059]/20 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059]">
        Litigation Briefing Tool <span className="text-slate-400">— Raport</span>
      </div>
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-[#C5A059]/20 pb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-[#C5A059]/30 bg-[#001730] p-2.5 text-[#C5A059]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C5A059]">Conversation</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Czat prawniczy</h2>
            <p className="mt-1 text-sm text-slate-400">Podstawowa rozmowa — moduł będziemy rozwijać.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadChatPDF(messages, documentLabel)}
            data-pdf-exclude="true"
            className="inline-flex items-center gap-2 rounded-lg border border-[#C5A059] bg-[#002147] px-3 py-2 text-xs font-medium text-[#C5A059] shadow-md transition-all hover:bg-[#C5A059] hover:text-[#001730] sm:px-4 sm:text-sm"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Pobierz PDF
          </button>
          <button
            type="button"
            onClick={() => void clearChatHistory()}
            disabled={isSending}
            data-pdf-exclude="true"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A059]/30 px-2.5 py-2 text-xs text-slate-400 transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-not-allowed disabled:opacity-50"
            title="Wyczyść rozmowę"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Wyczyść
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex items-center rounded-lg border border-[#C5A059]/30 bg-[#001730]/70 px-3.5 py-3 text-xs text-slate-300">
          <span className="mr-1.5 text-slate-400">Analizowane pismo:</span>
          <span className="truncate font-medium text-[#C5A059]" title={documentLabel}>{documentLabel}</span>
        </div>
        <div data-pdf-exclude="true">
          <label className="sr-only" htmlFor="chatPersona">Tryb AI</label>
          <select
            id="chatPersona"
            value={persona}
            onChange={(event) => setPersona(event.target.value as FormalChatPersona)}
            className="w-full rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-xs text-slate-200 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
          >
            {formalPersonaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value} — {option.description}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!documentText.trim() && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-950/20 px-3.5 py-3 text-xs text-amber-200">
          Wgraj lub wklej pismo w zakładce „Analiza pisma”, aby czat mógł się do niego odnosić.
        </div>
      )}

      <div className="flex min-h-[480px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-[#C5A059]/20 bg-[#001730]/70 p-4" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex items-end gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "model" && (
                <div className="rounded-full border border-[#C5A059]/30 bg-[#002147] p-2 text-[#C5A059]">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#C5A059] text-[#001730] whitespace-pre-wrap" : "border border-[#C5A059]/20 bg-[#002147] text-slate-200"}`}>
                {message.role === "model" ? (
                  <div className="prose prose-invert max-w-none space-y-3 leading-relaxed text-slate-200">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h3: ({ ...props }) => (
                          <h3 className="mt-4 mb-2 border-b border-[#C5A059]/20 pb-1 text-lg font-semibold text-[#C5A059]" {...props} />
                        ),
                        p: ({ ...props }) => (
                          <p className="mb-3 leading-relaxed text-slate-200" {...props} />
                        ),
                        ul: ({ ...props }) => (
                          <ul className="my-2 list-disc list-inside space-y-1 text-slate-200" {...props} />
                        ),
                        ol: ({ ...props }) => (
                          <ol className="my-2 list-decimal list-inside space-y-1 text-slate-200" {...props} />
                        ),
                        li: ({ ...props }) => <li className="ml-2" {...props} />,
                        strong: ({ ...props }) => (
                          <strong className="rounded bg-indigo-950/40 px-1 font-semibold text-white" {...props} />
                        ),
                        hr: ({ ...props }) => <hr className="my-4 border-[#C5A059]/30" {...props} />,
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  message.text
                )}
              </div>
              {message.role === "user" && (
                <div className="rounded-full border border-[#C5A059]/30 bg-[#002147] p-2 text-[#C5A059]">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#C5A059]" aria-hidden="true" />
              Przygotowuję odpowiedź...
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-950/30 px-3.5 py-3 text-sm text-red-200" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4" data-pdf-exclude="true">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#C5A059]">Szybkie sugestie</p>
          <div className="flex flex-wrap gap-2">
            {smartSuggestions.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => void sendChatMessage(suggestion.query)}
                disabled={isSending}
                className="rounded-full border border-[#C5A059]/40 bg-[#001730]/70 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>

        <form className="mt-4 flex gap-2" onSubmit={handleChatSubmit} data-pdf-exclude="true">
          <label className="sr-only" htmlFor="chatMessage">Wiadomość</label>
          <input
            id="chatMessage"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Napisz wiadomość..."
            className="min-w-0 flex-1 rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="inline-flex items-center justify-center rounded-lg border-2 border-[#C5A059] bg-[#002147] px-4 text-[#C5A059] transition-all hover:bg-[#C5A059] hover:text-[#001730] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Wyślij wiadomość"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [authLoading, setAuthLoading] = useState(!PUBLIC_TEST_MODE);
  const [userEmail, setUserEmail] = useState("");
  const {
    caseId,
    setCaseId,
    setDocumentType,
    documentType,
    text,
    setText,
    fileName,
    setFileName,
    documentFile,
    setDocumentFile,
    documentFileUrl,
    setDocumentFileUrl,
  } = useBriefing();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [context, setContext] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [checkedChecklist, setCheckedChecklist] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<"analysis" | "chat">("analysis");
  const [selectedCitation, setSelectedCitation] = useState<PdfCitation | null>(null);
  const [isCourtCardOpen, setIsCourtCardOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [isCasesLoading, setIsCasesLoading] = useState(!PUBLIC_TEST_MODE);
  const [isCaseLoading, setIsCaseLoading] = useState(false);
  const [casesError, setCasesError] = useState("");

  useEffect(() => {
    if (PUBLIC_TEST_MODE) return;
    let isMounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      if (!data.user) {
        router.replace("/auth");
        return;
      }
      setUserEmail(data.user.email ?? "");
      setAuthLoading(false);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/auth");
        return;
      }
      setUserEmail(session.user.email ?? "");
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    if (PUBLIC_TEST_MODE) return;
    if (authLoading) return;
    let isMounted = true;
    void fetchWithTimeout("/api/cases")
      .then((response) => readApiResponse<{ cases?: SavedCase[] }>(response, "Nie udało się pobrać zapisanych spraw."))
      .then((payload) => {
        if (!isMounted) return;
        setSavedCases(payload.cases ?? []);
        setCasesError("");
      })
      .catch((error) => {
        if (isMounted) setCasesError(error instanceof Error ? error.message : "Nie udało się pobrać zapisanych spraw.");
      })
      .finally(() => {
        if (isMounted) setIsCasesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [authLoading]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  const deleteSavedCase = async (id: string, title: string) => {
    if (!window.confirm(`Czy na pewno usunąć sprawę „${title}” wraz z analizą, czatem i plikiem PDF?`)) return;

    setCasesError("");
    try {
      const response = await fetchWithTimeout(`/api/cases/${id}`, { method: "DELETE" });
      await readApiResponse(response, "Nie udało się usunąć sprawy.");
      setSavedCases((current) => current.filter((savedCase) => savedCase.id !== id));

      if (caseId === id) {
        setCaseId(null);
        setDocumentFile(null);
        setDocumentFileUrl(null);
        setFileName("");
        setText("");
        setContext("");
        setResult(null);
        setSelectedCitation(null);
      }
    } catch (deleteError) {
      setCasesError(deleteError instanceof Error ? deleteError.message : "Nie udało się usunąć sprawy.");
    }
  };

  const loadSavedCase = async (id: string) => {
    setCasesError("");
    setIsCaseLoading(true);
    setDocumentFile(null);
    setDocumentFileUrl(null);
    setResult(null);
    setSelectedCitation(null);
    try {
      const response = await fetchWithTimeout(`/api/cases/${id}`);
      const payload = await readApiResponse<{ case?: SavedCase & { document_text?: string; context?: string } }>(
        response,
        "Nie udało się otworzyć sprawy.",
      );
      if (!payload.case) throw new Error("Nie znaleziono zapisanej sprawy.");

      setCaseId(payload.case.id);
      setDocumentType(payload.case.document_type);
      setFileName(payload.case.file_name ?? "");
      setDocumentFileUrl(payload.case.file_url ?? null);
      setText(payload.case.document_text ?? "");
      setContext(payload.case.context ?? "");
      setResult(payload.case.analysis);
      setActiveTab("analysis");
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : "Nie udało się otworzyć sprawy.");
    } finally {
      setIsCaseLoading(false);
    }
  };

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const splitView = document.getElementById("analysis-split-view");
      if (!splitView) return;
      const bounds = splitView.getBoundingClientRect();
      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setLeftPanelWidth(Math.min(70, Math.max(30, nextWidth)));
    };
    const stopResizing = () => setIsResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
    };
  }, [isResizing]);

  const loadTextFile = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      setIsExtracting(true);
      setError("");
      setFileName(file.name);
      setDocumentFile(file);
      setDocumentFileUrl(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithTimeout("/api/extract-pdf", {
          method: "POST",
          body: formData,
        });
        const payload = await readApiResponse<{ text?: string }>(
          response,
          "Nie udało się odczytać pliku PDF. Spróbuj ponownie.",
        );
        if (!payload?.text) {
          throw new Error("Nie znaleziono tekstu w pliku PDF. Jeśli to skan, potrzebny będzie OCR.");
        }

        setText(payload.text);
        if (PUBLIC_TEST_MODE) return;

        try {
          const publicUrl = await uploadPdfToStorage(supabase, file);
          setDocumentFileUrl(publicUrl);
        } catch (uploadError) {
          setDocumentFileUrl(null);
          setError(
            uploadError instanceof Error
              ? `${uploadError.message} Tekst PDF został odczytany, więc analiza nadal jest możliwa.`
              : "Nie udało się zapisać oryginalnego pliku PDF. Tekst został odczytany, więc analiza nadal jest możliwa.",
          );
        }
      } catch (fileError) {
        setText("");
        setDocumentFileUrl(null);
        setError(fileError instanceof Error ? fileError.message : "Nie udało się odczytać pliku PDF.");
      } finally {
        setIsExtracting(false);
      }
      return;
    }

    if (!file.name.match(/\.(txt|md|json)$/i)) {
      setError("Wybierz plik PDF, TXT, MD lub JSON.");
      return;
    }

    try {
      setText(await file.text());
      setFileName(file.name);
      setDocumentFile(null);
      setDocumentFileUrl(null);
      setError("");
    } catch {
      setError("Nie udało się odczytać wybranego pliku.");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadTextFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadTextFile(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isExtracting) {
      setError("Poczekaj, aż PDF zostanie odczytany.");
      return;
    }

    if (!text.trim()) {
      if (!error) setError("Dodaj treść pisma, aby rozpocząć analizę.");
      return;
    }

    setError("");
    setResult(null);
    setCheckedChecklist({});
    setIsLoading(true);
    try {
      const response = await fetchWithTimeout(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, documentType, context }),
        },
        CLIENT_ANALYSIS_TIMEOUT_MS,
      );
      const payload = await readApiResponse<AnalysisResult>(
        response,
        "Nie udało się przeanalizować pisma. Spróbuj ponownie.",
      );

      setResult(payload);
      if (!PUBLIC_TEST_MODE) {
      try {
        const savedCaseId = await createCaseRecord({
          title: fileName || documentType || "Nowa sprawa",
          documentType,
          fileName,
          documentText: text,
          context,
          fileUrl: documentFileUrl,
          analysis: payload,
        });
        setCaseId(savedCaseId);
      } catch (saveError) {
        setError(saveError instanceof Error ? `Analiza jest gotowa, ale nie zapisano sprawy: ${saveError.message}` : "Analiza jest gotowa, ale nie zapisano sprawy.");
      }
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Nie udało się przeanalizować pisma. Spróbuj ponownie.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#001730] text-slate-200">
        <Loader2 className="h-7 w-7 animate-spin text-[#C5A059]" aria-label="Ładowanie sesji" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#001730] px-4 py-8 text-slate-200 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 border-b border-[#C5A059]/20 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C5A059]/40 bg-[#002147] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059]">
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              Litigation briefing tool
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Legal Opposition Summarizer
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Przekształć pismo procesowe w klarowną mapę zarzutów, kontrargumentów
              i rekomendowanych wniosków procesowych.
            </p>
          </div>
          <div className="flex flex-col items-start gap-5 sm:items-end">
            <div className="flex h-[4.5rem] w-64 items-center justify-center overflow-hidden rounded-lg bg-[#001730]">
              <Image
                src="/helpfind-logo-v2.png"
                alt="helpfind"
                width={1580}
                height={996}
                priority
                className="h-[4.5rem] w-64 object-cover object-center"
              />
            </div>
            <div className={PUBLIC_TEST_MODE ? "hidden" : "hidden items-center gap-3 text-xs text-slate-400 sm:flex"}>
              <CheckCircle2 className="h-4 w-4 text-[#C5A059]" aria-hidden="true" />
              Analiza wspierana przez Gemini
              <span className="max-w-44 truncate border-l border-[#C5A059]/20 pl-3" title={userEmail}>{userEmail}</span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#C5A059]/30 px-2 py-1.5 transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Wyloguj
              </button>
            </div>
          </div>
        </header>

        <nav className="mb-6 flex w-full max-w-xl rounded-xl border border-[#C5A059]/30 bg-[#002147] p-1.5" role="tablist" aria-label="Moduły aplikacji">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "analysis"}
            onClick={() => setActiveTab("analysis")}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
              activeTab === "analysis"
                ? "bg-[#C5A059] text-[#001730]"
                : "text-slate-400 hover:text-[#C5A059]"
            }`}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Analiza pisma
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
              activeTab === "chat"
                ? "bg-[#C5A059] text-[#001730]"
                : "text-slate-400 hover:text-[#C5A059]"
            }`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Czat prawniczy
          </button>
        </nav>

        <section className={PUBLIC_TEST_MODE ? "hidden" : "mb-6 rounded-xl border border-[#C5A059]/30 bg-[#002147] p-4 shadow-xl shadow-black/10"} aria-labelledby="saved-cases-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C5A059]">Pamięć projektu</p>
              <h2 id="saved-cases-title" className="mt-1 text-base font-semibold text-white">Moje sprawy</h2>
            </div>
            {isCasesLoading && <Loader2 className="h-4 w-4 animate-spin text-[#C5A059]" aria-label="Ładowanie spraw" />}
          </div>
          {casesError && <p className="mt-3 text-sm text-amber-200">{casesError}</p>}
          {!isCasesLoading && savedCases.length === 0 && !casesError && (
            <p className="mt-3 text-sm text-slate-400">Po pierwszej analizie zapisane sprawy pojawią się tutaj.</p>
          )}
          {savedCases.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedCases.map((savedCase) => (
                <div
                  key={savedCase.id}
                  className="flex items-stretch gap-1 rounded-lg border border-[#C5A059]/30 bg-[#001730] p-1 text-xs text-slate-300"
                >
                  <button
                    type="button"
                    onClick={() => void loadSavedCase(savedCase.id)}
                    className="min-w-0 flex-1 rounded-md px-2 py-1 text-left transition hover:text-[#C5A059]"
                  >
                  <span className="block max-w-64 truncate font-medium">{savedCase.title}</span>
                  <span className="mt-1 block text-slate-500">{savedCase.document_type}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSavedCase(savedCase.id, savedCase.title)}
                    className="inline-flex items-center justify-center rounded-md px-2 text-slate-500 transition hover:bg-red-950/40 hover:text-red-200"
                    title="Usuń sprawę i historię"
                    aria-label={`Usuń sprawę ${savedCase.title}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={activeTab === "analysis" ? "block" : "hidden"} role="tabpanel">
        <div id="analysis-split-view" className="flex flex-col gap-4 md:flex-row md:gap-0">
          <section style={{ flexBasis: `${leftPanelWidth}%` }} className="w-full min-w-0 rounded-xl border border-[#C5A059]/30 bg-[#002147] p-5 shadow-2xl shadow-black/20 sm:p-7 md:w-auto">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-lg border border-[#C5A059]/30 bg-[#001730] p-2.5 text-[#C5A059]">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Dokument do analizy</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Uzupełnij dane sprawy i wklej treść pisma procesowego.
                </p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="documentType">
                  Typ dokumentu
                </label>
                <select
                  id="documentType"
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  className="w-full rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
                >
                  {documentTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
                  isDragging
                    ? "border-[#C5A059] bg-[#C5A059]/10"
                    : "border-[#C5A059]/30 bg-[#001730]/70 hover:border-[#C5A059]/70"
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) setIsDragging(false);
                }}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-6 w-6 text-[#C5A059]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-slate-200">
                  {isExtracting ? "Odczytuję PDF..." : fileName || "Przeciągnij plik tutaj"}
                </p>
                <p className="mt-1 text-xs text-slate-400">PDF zostanie automatycznie zamieniony na tekst</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown,application/json"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                  className="mt-4 rounded-md border border-[#C5A059]/60 px-3 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#001730]"
                >
                  Wybierz plik PDF
                </button>
              </div>

              <div className="mb-1">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C5A059]">Przeglądarka dokumentu PDF</p>
                  {selectedCitation && (
                    <span className="text-[11px] text-slate-400">Aktywne: strona {selectedCitation.pageNumber}</span>
                  )}
                </div>
                <PdfDocumentViewer
                  file={documentFile ?? documentFileUrl}
                  fileName={fileName}
                  citation={selectedCitation}
                  isLoading={isCaseLoading}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="documentText">
                  Treść pisma procesowego
                </label>
                <textarea
                  id="documentText"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setDocumentFile(null);
                    setDocumentFileUrl(null);
                    if (fileName) setFileName("");
                  }}
                  placeholder="Wklej tutaj treść pisma procesowego..."
                  rows={12}
                  className="w-full resize-y rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="context">
                  Kontekst sprawy <span className="font-normal text-slate-400">(opcjonalnie)</span>
                </label>
                <textarea
                  id="context"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="Najważniejsze fakty, etap postępowania, oczekiwany rezultat..."
                  rows={4}
                  className="w-full resize-y rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-950/30 px-3.5 py-3 text-sm text-red-200" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isExtracting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#C5A059] bg-[#002147] px-4 py-3.5 text-sm font-semibold text-[#C5A059] transition-all hover:bg-[#C5A059] hover:text-[#001730] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Odczytuję PDF...
                  </>
                ) : isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Analizuję pismo...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Przeanalizuj pismo
                  </>
                )}
              </button>
            </form>
          </section>

          <div
            role="separator"
            aria-label="Zmień szerokość paneli"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
            }}
            className={`hidden w-3 shrink-0 cursor-col-resize items-center justify-center md:flex ${isResizing ? "bg-[#C5A059]/10" : ""}`}
          >
            <div className="h-16 w-1 rounded-full bg-[#C5A059]/30 transition hover:bg-[#C5A059]" />
          </div>

          <section id="report-container" className="print-report min-w-0 flex-1 rounded-xl border border-[#C5A059]/30 bg-[#001730] p-5 shadow-2xl shadow-black/20 sm:p-7">
            <div className="mb-4 border-b border-[#C5A059]/20 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059]">
              Litigation Briefing Tool <span className="text-slate-400">— Raport</span>
            </div>
            {result ? (
              <div>
                <div className="mb-6 flex items-start justify-between gap-3 border-b border-[#C5A059]/20 pb-5">
                  <div className="rounded-lg border border-[#C5A059]/30 bg-[#001730] p-2.5 text-[#C5A059]">
                    <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#C5A059]">Briefing</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Wyniki analizy</h2>
                  </div>
                  {result.courtCard && (
                    <button
                      type="button"
                      onClick={() => setIsCourtCardOpen(true)}
                      data-pdf-exclude="true"
                      className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#C5A059] bg-[#002147] px-3 py-2 text-xs font-medium text-[#C5A059] shadow-md transition-all hover:bg-[#C5A059] hover:text-[#001730] sm:px-4 sm:text-sm"
                    >
                      <Smartphone className="h-4 w-4" aria-hidden="true" />
                      📱 Fiszka na Rozprawę
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void downloadAnalysisPDF(result, documentType)}
                    data-pdf-exclude="true"
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#C5A059] bg-[#002147] px-3 py-2 text-xs font-medium text-[#C5A059] shadow-md transition-all hover:bg-[#C5A059] hover:text-[#001730] sm:px-4 sm:text-sm"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Pobierz PDF
                  </button>
                </div>

                <div className="mb-7 rounded-lg border border-[#C5A059]/20 bg-[#001730]/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#C5A059]">Główne tezy</p>
                  <p className="text-sm leading-6 text-slate-200">{result.glowne_tezy}</p>
                  <CitationPills citations={result.glowne_tezy_odnosniki} onSelect={setSelectedCitation} />
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-[#C5A059]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#C5A059]">Zarzuty</h3>
                  </div>
                  <div className="space-y-3">
                    {result.zarzuty.length > 0 ? (
                      result.zarzuty.map((zarzut, index) => (
                        <article key={`${zarzut.nazwa}-${index}`} className="rounded-lg border border-[#C5A059]/20 bg-[#001730]/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-medium text-white">{zarzut.nazwa}</h4>
                            <span className="rounded-full border border-[#C5A059]/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C5A059]">
                              {zarzut.typ}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{zarzut.opis}</p>
                          <div className="mt-3 border-l-2 border-[#C5A059]/60 pl-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#C5A059]">Kontrargument</p>
                            <p className="mt-1 text-sm leading-6 text-slate-300">{zarzut.kontrargument}</p>
                          <CitationPills citations={zarzut.odnosniki} onSelect={setSelectedCitation} />
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">Nie zidentyfikowano wyraźnych zarzutów.</p>
                    )}
                  </div>
                </div>

                <div className="no-print mt-7">
                  <div className="mb-3 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-[#C5A059]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#C5A059]">Wnioski procesowe</h3>
                  </div>
                  <div className="space-y-3">
                    {result.wnioski_procesowe.length > 0 ? (
                      result.wnioski_procesowe.map((wniosek, index) => (
                        <article key={`${wniosek.wniosek}-${index}`} className="rounded-lg border border-[#C5A059]/20 bg-[#001730]/60 p-4">
                          <h4 className="font-medium text-white">{wniosek.wniosek}</h4>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{wniosek.cel}</p>
                          <CitationPills citations={wniosek.odnosniki} onSelect={setSelectedCitation} />
                        </article>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">Nie zaproponowano dodatkowych wniosków.</p>
                    )}
                  </div>
                </div>

                <div className="mt-7">
                  <div className="mb-3 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-[#C5A059]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#C5A059]">Checklista dla prawnika</h3>
                  </div>
                  <div className="space-y-2">
                    {result.checklista.length > 0 ? (
                      result.checklista.map((item, index) => (
                        <label
                          key={`${item.zadanie}-${index}`}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                            checkedChecklist[index]
                              ? "border-[#C5A059]/50 bg-[#C5A059]/10"
                              : "border-[#C5A059]/20 bg-[#001730]/60 hover:border-[#C5A059]/40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(checkedChecklist[index])}
                            onChange={(event) =>
                              setCheckedChecklist((current) => ({
                                ...current,
                                [index]: event.target.checked,
                              }))
                            }
                            className="mt-1 h-4 w-4 shrink-0 accent-[#C5A059]"
                          />
                          <span>
                            <span className={`block text-sm font-medium ${checkedChecklist[index] ? "text-[#C5A059] line-through" : "text-white"}`}>
                              {item.zadanie}
                            </span>
                            <span className="mt-1 block text-sm leading-6 text-slate-400">{item.uzasadnienie}</span>
                            <CitationPills citations={item.odnosniki} onSelect={setSelectedCitation} />
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">Nie wygenerowano checklisty.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="rounded-2xl border border-[#C5A059]/30 bg-[#001730] p-4 text-[#C5A059]">
                  <Gavel className="h-8 w-8" aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-white">Twoje wyniki pojawią się tutaj</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">
                  Wypełnij formularz, aby otrzymać uporządkowane omówienie tez, zarzutów i rekomendowanych działań.
                </p>
                <div className="mt-8 grid w-full max-w-sm gap-3 text-left sm:grid-cols-2">
                  <div className="rounded-lg border border-[#C5A059]/20 bg-[#001730]/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#C5A059]">01</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Wklej treść pisma</p>
                  </div>
                  <div className="rounded-lg border border-[#C5A059]/20 bg-[#001730]/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#C5A059]">02</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Uruchom analizę AI</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
        </div>
        <div className={activeTab === "chat" ? "block" : "hidden"} role="tabpanel">
          <ChatPanel />
        </div>

        <CourtCardModal
          courtCard={result?.courtCard ?? null}
          open={isCourtCardOpen}
          onClose={() => setIsCourtCardOpen(false)}
        />

        <footer className="mt-6 flex items-center justify-between border-t border-[#C5A059]/20 pt-5 text-xs text-slate-500">
          <span>Legal Opposition Summarizer</span>
          <span>Wstępna analiza wspierająca pracę pełnomocnika</span>
        </footer>
      </div>
    </main>
  );
}
