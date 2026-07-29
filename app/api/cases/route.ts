import { NextResponse } from "next/server";
import { apiError, MAX_CONTEXT_CHARS } from "../_safety";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby zobaczyć swoje sprawy.", 401);

  const { data, error } = await supabase
    .from("cases")
    .select("id, title, document_type, file_name, file_url, analysis, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Cases list failed:", error);
    return apiError("DATABASE_ERROR", "Nie udało się pobrać listy spraw.", 500);
  }

  return NextResponse.json({ cases: data });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby zapisać sprawę.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Nieprawidłowy JSON w treści żądania.", 400);
  }

  if (!body || typeof body !== "object") {
    return apiError("INVALID_BODY", "Treść żądania musi być obiektem JSON.", 400);
  }

  const value = body as Record<string, unknown>;
  const documentText = typeof value.documentText === "string" ? value.documentText : "";
  if (documentText.length > MAX_CONTEXT_CHARS) {
    return apiError("CONTEXT_TOO_LONG", "Treść sprawy jest za długa do zapisania.", 400);
  }

  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Nowa sprawa";
  const documentType = typeof value.documentType === "string" && value.documentType.trim()
    ? value.documentType.trim()
    : "Inne pismo procesowe";

  const { data, error } = await supabase
    .from("cases")
    .insert({
      user_id: user.id,
      title,
      document_type: documentType,
      file_name: typeof value.fileName === "string" ? value.fileName : null,
      file_url: typeof value.fileUrl === "string" ? value.fileUrl : null,
      document_text: documentText,
      context: typeof value.context === "string" ? value.context : "",
      analysis: value.analysis ?? null,
    })
    .select("id, title, document_type, file_name, file_url, analysis, created_at, updated_at")
    .single();

  if (error) {
    console.error("Case creation failed:", error);
    return apiError("DATABASE_ERROR", "Nie udało się zapisać sprawy.", 500);
  }

  return NextResponse.json({ case: data }, { status: 201 });
}
