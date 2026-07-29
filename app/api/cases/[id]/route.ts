import { NextResponse } from "next/server";
import { apiError } from "../../_safety";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby otworzyć sprawę.", 401);

  const { id } = await params;
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .single();

  if (error || !data) return apiError("CASE_NOT_FOUND", "Nie znaleziono tej sprawy.", 404);
  return NextResponse.json({ case: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby zapisać zmiany.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Nieprawidłowy JSON w treści żądania.", 400);
  }

  if (!body || typeof body !== "object") return apiError("INVALID_BODY", "Treść żądania musi być obiektem JSON.", 400);

  const value = body as Record<string, unknown>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof value.title === "string") update.title = value.title.trim() || "Nowa sprawa";
  if (typeof value.analysis !== "undefined") update.analysis = value.analysis;
  if (typeof value.documentText === "string") update.document_text = value.documentText;
  if (typeof value.context === "string") update.context = value.context;
  if (typeof value.documentType === "string") update.document_type = value.documentType;
  if (typeof value.fileName === "string") update.file_name = value.fileName || null;
  if (typeof value.fileUrl === "string") update.file_url = value.fileUrl || null;

  const { id } = await params;
  const { data, error } = await supabase
    .from("cases")
    .update(update)
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .select("*")
    .single();

  if (error || !data) return apiError("DATABASE_ERROR", "Nie udało się zapisać zmian sprawy.", 500);
  return NextResponse.json({ case: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby usunąć sprawę.", 401);

  const { id } = await params;
  const { data: existingCase, error: lookupError } = await supabase
    .from("cases")
    .select("file_url")
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .single();

  if (lookupError || !existingCase) return apiError("CASE_NOT_FOUND", "Nie znaleziono tej sprawy.", 404);

  if (existingCase.file_url) {
    try {
      const fileUrl = new URL(existingCase.file_url);
      const marker = "/storage/v1/object/public/case-files/";
      const markerIndex = fileUrl.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const filePath = decodeURIComponent(fileUrl.pathname.slice(markerIndex + marker.length));
        const { error: storageError } = await supabase.storage.from("case-files").remove([filePath]);
        if (storageError) console.warn("Case PDF cleanup failed:", storageError.message);
      }
    } catch (storageError) {
      console.warn("Case PDF URL could not be parsed:", storageError);
    }
  }

  const { error } = await supabase
    .from("cases")
    .delete()
    .eq("id", id)
    .eq("user_id", authData.user.id);

  if (error) return apiError("DATABASE_ERROR", "Nie udało się usunąć sprawy.", 500);
  return NextResponse.json({ success: true });
}
