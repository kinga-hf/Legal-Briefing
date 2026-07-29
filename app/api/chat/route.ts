import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { apiError, classifyGeminiError, MAX_CONTEXT_CHARS, runWithSafetyGuard } from "../_safety";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "user" | "model";
  text: string;
};

type ChatPersona = "Strateg Procesowy" | "Adwokat Diabła" | "Legal Design";

const personaInstructions: Record<ChatPersona, string> = {
  "Strateg Procesowy":
    "Analizuj rozmowę z perspektywy procedury cywilnej, kolejności działań, ryzyk i taktyki procesowej.",
  "Adwokat Diabła":
    "Krytycznie szukaj słabych punktów naszej argumentacji, możliwych kontrataków przeciwnika i nieudowodnionych założeń.",
  "Legal Design":
    "Wyjaśniaj sprawy prostym, uporządkowanym językiem zrozumiałym dla klienta i ograniczaj żargon.",
};

type FormalChatPersona =
  | "Analiza Taktyczna i Proceduralna"
  | "Krytyczna Ocena Ryzyka (Słabe Punkty)"
  | "Podsumowanie dla Klienta (Plain Language)";

void personaInstructions;

const formalPersonaInstructions: Record<FormalChatPersona, string> = {
  "Analiza Taktyczna i Proceduralna":
    "Analizuj rozmowę z perspektywy procedury cywilnej, kolejności działań, terminów, dowodów i praktycznej taktyki procesowej.",
  "Krytyczna Ocena Ryzyka (Słabe Punkty)":
    "Krytycznie szukaj słabych punktów naszej argumentacji, możliwych kontrataków przeciwnika i nieudowodnionych założeń.",
  "Podsumowanie dla Klienta (Plain Language)":
    "Wyjaśniaj sprawy prostym, uporządkowanym językiem zrozumiałym dla klienta i ograniczaj żargon.",
};

const baseSystemInstruction = `
Jesteś pomocnym, spokojnym asystentem prowadzącym zwykłą rozmowę po polsku.
Odpowiadaj jasno i naturalnie, uwzględniając poprzednie wiadomości. Na tym etapie
nie wykonuj wyspecjalizowanej analizy pism procesowych i nie udawaj, że zastępujesz
adwokata. Jeśli rozmowa dotyczy prawa, zaznacz, że odpowiedź ma charakter ogólny
i nie jest indywidualną poradą prawną.
`.trim();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Nieprawidłowy JSON w treści żądania.", 400);
  }

  const messages =
    body && typeof body === "object" && Array.isArray((body as { messages?: unknown }).messages)
      ? (body as { messages: unknown[] }).messages
      : null;

  if (!messages || messages.length === 0 || messages.length > 40) {
    return apiError("INVALID_MESSAGES", "Pole messages musi zawierać od 1 do 40 wiadomości.", 400);
  }

  const validMessages = messages.every((message): message is IncomingMessage => {
    if (!message || typeof message !== "object") return false;
    const item = message as Record<string, unknown>;
    return (
      (item.role === "user" || item.role === "model") &&
      typeof item.text === "string" &&
      item.text.trim().length > 0
    );
  });

  if (!validMessages) {
    return apiError(
      "INVALID_MESSAGES",
      "Każda wiadomość musi mieć rolę user/model oraz niepusty tekst.",
      400,
    );
  }

  const requestBody = body as Record<string, unknown>;
  const requestedPersona = requestBody.persona;
  const persona: FormalChatPersona =
    typeof requestedPersona === "string" && requestedPersona in formalPersonaInstructions
      ? (requestedPersona as FormalChatPersona)
      : "Analiza Taktyczna i Proceduralna";
  const documentText = typeof requestBody.documentText === "string" ? requestBody.documentText.trim() : "";
  const documentType = typeof requestBody.documentType === "string" ? requestBody.documentType.trim() : "";
  const documentName = typeof requestBody.documentName === "string" ? requestBody.documentName.trim() : "";
  const typedMessages = messages as IncomingMessage[];
  const totalContextLength = documentText.length + typedMessages.reduce((sum, message) => sum + message.text.length, 0);

  if (totalContextLength > MAX_CONTEXT_CHARS) {
    return apiError(
      "CONTEXT_TOO_LONG",
      "Dokument lub historia rozmowy jest za długa. Skróć treść i spróbuj ponownie.",
      400,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return apiError("MISSING_API_KEY", "Brak skonfigurowanego klucza usługi AI.", 500);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `${baseSystemInstruction}

Wybrany tryb AI: ${persona}.
${formalPersonaInstructions[persona]}

${documentText ? `Kontekst analizowanego dokumentu (${documentName || documentType || "pismo procesowe"}):
--- POCZĄTEK TEKSTU PISMA ---
${documentText.slice(0, 120000)}
--- KONIEC TEKSTU PISMA ---` : "Nie przekazano jeszcze tekstu pisma; prowadź rozmowę bez odwoływania się do konkretnego dokumentu."}`;

    const response = await runWithSafetyGuard((abortSignal) =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: typedMessages.map((message) => ({
          role: message.role,
          parts: [{ text: message.text.trim() }],
        })),
        config: { systemInstruction, abortSignal },
      }),
    );

    const message = response.text?.trim();
    if (!message) {
      return apiError("EMPTY_RESPONSE", "Asystent AI nie zwrócił odpowiedzi.", 502);
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Chat request failed:", error);
    const details = classifyGeminiError(error);
    return apiError(details.errorType, details.userMessage, details.status);
  }
}
