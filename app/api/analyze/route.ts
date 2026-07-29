import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import {
  ANALYSIS_TIMEOUT_MS,
  apiError,
  classifyGeminiError,
  MAX_CONTEXT_CHARS,
  runWithSafetyGuard,
} from "../_safety";

export const runtime = "nodejs";

const modelName = "gemini-2.5-flash";

const citationSchema = {
  type: Type.OBJECT,
  properties: {
    pageNumber: {
      type: Type.NUMBER,
      description: "Numer strony PDF, na której znajduje się podstawa analizy.",
    },
    quote: {
      type: Type.STRING,
      description: "Krótki dosłowny cytat z tekstu dokumentu.",
    },
  },
  required: ["pageNumber", "quote"],
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    glowne_tezy: {
      type: Type.STRING,
      description:
        "Zwięzłe podsumowanie głównego celu i tezy przeciwnika.",
    },
    glowne_tezy_odnosniki: {
      type: Type.ARRAY,
      items: citationSchema,
    },
    zarzuty: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          typ: {
            type: Type.STRING,
            enum: ["Formalny", "Materialny"],
          },
          nazwa: {
            type: Type.STRING,
            description: "Krótka nazwa zarzutu.",
          },
          opis: {
            type: Type.STRING,
            description: "Szczegółowe wyjaśnienie zarzutu.",
          },
          kontrargument: {
            type: Type.STRING,
            description: "Rekomendowana riposta lub linia obrony.",
          },
          odnosniki: {
            type: Type.ARRAY,
            items: citationSchema,
          },
        },
        required: ["typ", "nazwa", "opis", "kontrargument", "odnosniki"],
      },
    },
    wnioski_procesowe: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          wniosek: {
            type: Type.STRING,
            description: "Treść wniosku procesowego.",
          },
          cel: {
            type: Type.STRING,
            description: "Cel procesowy wniosku.",
          },
          odnosniki: {
            type: Type.ARRAY,
            items: citationSchema,
          },
        },
        required: ["wniosek", "cel", "odnosniki"],
      },
    },
    checklista: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          zadanie: {
            type: Type.STRING,
            description: "Konkretne zadanie do wykonania przez prawnika.",
          },
          uzasadnienie: {
            type: Type.STRING,
            description: "Krótki powód i cel wykonania zadania.",
          },
          odnosniki: {
            type: Type.ARRAY,
            items: citationSchema,
          },
        },
        required: ["zadanie", "uzasadnienie", "odnosniki"],
      },
    },
    courtCard: {
      type: Type.OBJECT,
      properties: {
        coreDispute: {
          type: Type.STRING,
          description: "Jedno- lub dwuzdaniowe podsumowanie istoty sporu.",
        },
        topWeaknesses: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Trzy najważniejsze słabe punkty argumentacji przeciwnika.",
        },
        quickReplies: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
            required: ["question", "answer"],
          },
        },
        mustAskWitnessQuestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Najważniejsze pytania do zadania świadkom lub stronom.",
        },
      },
      required: ["coreDispute", "topWeaknesses", "quickReplies", "mustAskWitnessQuestions"],
    },
  },
  required: ["glowne_tezy", "glowne_tezy_odnosniki", "zarzuty", "wnioski_procesowe", "checklista", "courtCard"],
};

const systemInstruction = `
Do każdej tezy, zarzutu, rekomendacji i pozycji checklisty dodaj tablicę odnosniki.
Każdy odnośnik musi zawierać pageNumber oraz krótki, dosłowny quote z tekstu źródłowego.
Korzystaj z markerów stron w wyekstrahowanym tekście, np. „-- 2 of 8 --”. Nie wymyślaj numerów
stron ani cytatów. Jeżeli dokument nie zawiera wiarygodnych markerów lub podstawy dla odnośnika,
zwróć dla danego elementu pustą tablicę. Cytaty powinny być krótkie i rozpoznawalne w PDF.
Jesteś doświadczonym polskim adwokatem procesowym specjalizującym się w postępowaniu cywilnym.
Przeanalizuj pismo procesowe głęboko, metodycznie i praktycznie, z uwzględnieniem wymogów
Kodeksu postępowania cywilnego (KPC) oraz — wyłącznie w zakresie potrzebnym do oceny zarzutów —
przepisów prawa materialnego. Odpowiadaj po polsku.

Wykonaj analizę w następujących warstwach:
1. Ustal rzeczywisty cel pisma, żądania i główną tezę strony przeciwnej. Odróżnij twierdzenia
   faktyczne od ocen prawnych i wniosków.
2. Zidentyfikuj każdy istotny zarzut formalny. Sprawdź w szczególności: właściwość sądu,
   legitymację procesową, umocowanie, wymogi formalne pisma, oznaczenie stron i żądania,
   terminy, opłaty, doręczenia, przeszkody procesowe, prekluzję oraz prawidłowość wniosków
   dowodowych. Dla każdego zarzutu wskaż możliwy skutek procesowy, możliwość usunięcia braku
   i rekomendowaną reakcję.
3. Zidentyfikuj każdy istotny zarzut materialny. Oceń jego podstawę faktyczną, przesłanki,
   ciężar dowodu, związek z żądaniem, dostępne dowody, ryzyka oraz możliwe alternatywne linie
   argumentacji. Nie utożsamiaj samego twierdzenia strony z faktem udowodnionym.
4. Dla każdego zarzutu przygotuj konkretny kontrargument procesowy: wskaż, co należy zakwestionować,
   jaką podstawę faktyczną lub prawną wykorzystać, jaki dowód zgłosić i jaki cel procesowy osiągnąć.
   Uwzględnij odpowiedź główną oraz — gdy to uzasadnione — wariant ewentualny.
5. Zaproponuj wnioski procesowe tylko wtedy, gdy wynikają z treści sprawy. Wskaż ich cel i nie
   twórz wniosków pozornych ani nieopartych na ujawnionych faktach.
6. Utwórz praktyczną checklistę dla prawnika: czynności do wykonania, terminy do zweryfikowania,
   dowody i załączniki do zebrania, braki formalne do uzupełnienia oraz elementy odpowiedzi do
   przygotowania. Nie wymyślaj dat ani faktów; przy niepewności zaznacz konieczność weryfikacji.

Jeżeli powołujesz konkretny przepis KPC, rób to tylko wtedy, gdy jego zastosowanie wynika z analizy,
i nie wymyślaj numerów artykułów. Wyraźnie zaznacz elementy wymagające sprawdzenia w aktualnym stanie
prawnym. Nie udzielaj kategorycznej gwarancji wyniku postępowania i nie przedstawiaj analizy jako
indywidualnej porady zastępującej pełnomocnika.

Zwróć wyłącznie poprawny JSON dokładnie zgodny z przekazanym schematem. Zachowaj wszystkie wymagane
pola i ich nazwy. Nie dodawaj markdownu, bloku kodu, komentarzy ani żadnego tekstu przed JSON-em lub po nim.
Przygotuj również courtCard — krótką fiszkę na rozprawę dla prawnika. Pole courtCard ma zawierać:
- coreDispute: jedno- lub dwuzdaniowe, konkretne ujęcie istoty sporu;
- topWeaknesses: dokładnie trzy najważniejsze słabe punkty argumentacji przeciwnika;
- quickReplies: od trzech do pięciu prawdopodobnych pytań sędziego i krótkie, możliwe do wypowiedzenia riposty;
- mustAskWitnessQuestions: od trzech do pięciu najważniejszych pytań do świadków lub stron.
Nie dodawaj do courtCard odnośników, cytatów ani dodatkowych pól. Fiszka ma być konkretna, praktyczna,
łatwa do przeczytania w około 30 sekund i oparta wyłącznie na treści dokumentu oraz kontekście sprawy.

`.trim();

type Citation = {
  pageNumber: number;
  quote: string;
};

type AnalysisResult = {
  glowne_tezy: string;
  glowne_tezy_odnosniki: Citation[];
  zarzuty: Array<{
    typ: "Formalny" | "Materialny";
    nazwa: string;
    opis: string;
    kontrargument: string;
    odnosniki: Citation[];
  }>;
  wnioski_procesowe: Array<{
    wniosek: string;
    cel: string;
    odnosniki: Citation[];
  }>;
  checklista: Array<{
    zadanie: string;
    uzasadnienie: string;
    odnosniki: Citation[];
  }>;
  courtCard: {
    coreDispute: string;
    topWeaknesses: string[];
    quickReplies: Array<{ question: string; answer: string }>;
    mustAskWitnessQuestions: string[];
  };
};

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Record<string, unknown>;
  if (typeof result.glowne_tezy !== "string") return false;
  if (!Array.isArray(result.glowne_tezy_odnosniki)) return false;
  if (!Array.isArray(result.zarzuty)) return false;
  if (!Array.isArray(result.wnioski_procesowe)) return false;
  if (!Array.isArray(result.checklista)) return false;
  if (!result.courtCard || typeof result.courtCard !== "object") return false;

  const isCitationList = (valueToCheck: unknown) => {
    return (
      Array.isArray(valueToCheck) &&
      valueToCheck.every((citation) => {
        if (!citation || typeof citation !== "object") return false;
        const item = citation as Record<string, unknown>;
        return (
          typeof item.pageNumber === "number" &&
          Number.isInteger(item.pageNumber) &&
          item.pageNumber > 0 &&
          typeof item.quote === "string" &&
          item.quote.trim().length > 0
        );
      })
    );
  };

  if (!isCitationList(result.glowne_tezy_odnosniki)) return false;

  const validZarzuty = result.zarzuty.every((item) => {
    if (!item || typeof item !== "object") return false;
    const zarzut = item as Record<string, unknown>;
    return (
      (zarzut.typ === "Formalny" || zarzut.typ === "Materialny") &&
      typeof zarzut.nazwa === "string" &&
      typeof zarzut.opis === "string" &&
      typeof zarzut.kontrargument === "string" &&
      isCitationList(zarzut.odnosniki)
    );
  });

  const validWnioski = result.wnioski_procesowe.every((item) => {
    if (!item || typeof item !== "object") return false;
    const wniosek = item as Record<string, unknown>;
    return (
      typeof wniosek.wniosek === "string" &&
      typeof wniosek.cel === "string" &&
      isCitationList(wniosek.odnosniki)
    );
  });

  const validChecklista = result.checklista.every((item) => {
    if (!item || typeof item !== "object") return false;
    const checklistItem = item as Record<string, unknown>;
    return (
      typeof checklistItem.zadanie === "string" &&
      typeof checklistItem.uzasadnienie === "string" &&
      isCitationList(checklistItem.odnosniki)
    );
  });

  const courtCard = result.courtCard as Record<string, unknown>;
  const validCourtCard =
    typeof courtCard.coreDispute === "string" &&
    Array.isArray(courtCard.topWeaknesses) &&
    courtCard.topWeaknesses.every((item) => typeof item === "string") &&
    Array.isArray(courtCard.quickReplies) &&
    courtCard.quickReplies.every((item) => {
      if (!item || typeof item !== "object") return false;
      const reply = item as Record<string, unknown>;
      return typeof reply.question === "string" && typeof reply.answer === "string";
    }) &&
    Array.isArray(courtCard.mustAskWitnessQuestions) &&
    courtCard.mustAskWitnessQuestions.every((item) => typeof item === "string");

  return validZarzuty && validWnioski && validChecklista && validCourtCard;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Nieprawidłowy JSON w treści żądania.", 400);
  }

  if (!body || typeof body !== "object") {
    return apiError("INVALID_BODY", "Treść żądania musi być obiektem JSON.", 400);
  }

  const { text, documentType, context } = body as Record<string, unknown>;

  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    typeof documentType !== "string" ||
    documentType.trim().length === 0 ||
    typeof context !== "string"
  ) {
    return apiError(
      "INVALID_INPUT",
      "Wymagane są pola text, documentType oraz context w poprawnym formacie.",
      400,
    );
  }

  if (text.length > MAX_CONTEXT_CHARS) {
    return apiError(
      "CONTEXT_TOO_LONG",
      "Dokument jest za długi. Skróć treść do 120 000 znaków i spróbuj ponownie.",
      400,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return apiError("MISSING_API_KEY", "Brak skonfigurowanego klucza usługi AI.", 500);
  }

  const prompt = `
Typ dokumentu: ${documentType.trim()}

Kontekst sprawy:
${context.trim() || "Brak dodatkowego kontekstu."}

Treść pisma procesowego:
--- POCZĄTEK PISMA ---
${text.trim()}
--- KONIEC PISMA ---
`.trim();

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await runWithSafetyGuard((abortSignal) =>
      ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
          abortSignal,
        },
      }),
      ANALYSIS_TIMEOUT_MS,
    );

    const rawResult = response.text?.trim();
    if (!rawResult) {
      return apiError("EMPTY_RESPONSE", "Usługa AI nie zwróciła treści analizy.", 502);
    }

    let result: unknown;
    try {
      result = JSON.parse(rawResult);
    } catch {
      return apiError("INVALID_AI_RESPONSE", "Usługa AI zwróciła odpowiedź w nieprawidłowym formacie.", 502);
    }

    if (!isAnalysisResult(result)) {
      return apiError("INVALID_AI_RESPONSE", "Usługa AI zwróciła dane o nieprawidłowej strukturze.", 502);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    const details = classifyGeminiError(error);
    return apiError(details.errorType, details.userMessage, details.status);
  }
}
