import { NextResponse } from "next/server";

export const MAX_STEPS = 5;
export const API_TIMEOUT_MS = 30_000;
export const ANALYSIS_TIMEOUT_MS = 120_000;
export const MAX_CONTEXT_CHARS = 120_000;

type ErrorDetails = {
  errorType: string;
  userMessage: string;
  status: number;
};

export function apiError(errorType: string, userMessage: string, status: number) {
  return NextResponse.json(
    { success: false, errorType, userMessage },
    { status },
  );
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = value.message ?? value.error;
    const status = value.status ?? value.code;
    if (typeof message === "string" && status !== undefined) return [status, message].join(": ");
    if (typeof message === "string") return message;
    if (typeof status === "string" || typeof status === "number") return String(status);
  }

  return String(error);
}

export function classifyGeminiError(error: unknown): ErrorDetails {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();

  if (error instanceof Error && error.name === "AbortError") {
    return {
      errorType: "TIMEOUT",
      userMessage: "Analiza trwała zbyt długo. Spróbuj ponowić próbę lub skrócić dokument.",
      status: 504,
    };
  }

  if (/429|resource_exhausted|rate limit|too many requests/.test(normalized)) {
    return {
      errorType: "RATE_LIMIT",
      userMessage: "Limit zapytań został chwilowo przekroczony. Odczekaj chwilę i spróbuj ponownie.",
      status: 429,
    };
  }

  if (/context.*(too long|length)|too long.*context|token limit|maximum.*token/.test(normalized)) {
    return {
      errorType: "CONTEXT_TOO_LONG",
      userMessage: "Dokument lub kontekst jest za długi. Skróć treść i spróbuj ponownie.",
      status: 400,
    };
  }

  if (/\b400\b|invalid_argument/.test(normalized)) {
    return {
      errorType: "INVALID_REQUEST",
      userMessage: "Usługa AI odrzuciła żądanie. Sprawdź treść dokumentu i spróbuj ponownie.",
      status: 400,
    };
  }

  if (/network|fetch failed|econn|enotfound|socket|timed out|timeout/.test(normalized)) {
    return {
      errorType: "NETWORK_ERROR",
      userMessage: "Wystąpił problem z połączeniem z usługą AI. Sprawdź połączenie i spróbuj ponownie.",
      status: 503,
    };
  }

  return {
    errorType: "UPSTREAM_ERROR",
    userMessage: "Nie udało się uzyskać odpowiedzi od usługi AI. Spróbuj ponownie.",
    status: 502,
  };
}

export function isRetryableGeminiError(error: unknown) {
  const { errorType } = classifyGeminiError(error);
  return errorType === "RATE_LIMIT" || errorType === "NETWORK_ERROR";
}

export async function runWithSafetyGuard<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = API_TIMEOUT_MS,
) {
  let lastError: unknown;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const timeoutError = new Error("AI request timed out.");
        timeoutError.name = "AbortError";
        reject(timeoutError);
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(controller.signal), timeoutPromise]);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || step === MAX_STEPS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (step + 1)));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Nie udało się wykonać żądania AI.");
}
