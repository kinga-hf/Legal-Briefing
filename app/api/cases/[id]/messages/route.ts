import { NextResponse } from "next/server";
import { apiError, MAX_CONTEXT_CHARS } from "../../../_safety";
import { createClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

async function getUserAndClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby zobaczyć historię czatu.", 401);

  const { id } = await params;
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, text, created_at")
    .eq("case_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return apiError("DATABASE_ERROR", "Nie udało się pobrać historii czatu.", 500);
  return NextResponse.json({ messages: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return apiError("UNAUTHENTICATED", "Zaloguj się, aby zapisać wiadomość.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Nieprawidłowy JSON w treści żądania.", 400);
  }

  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const role = value.role === "user" || value.role === "model" ? value.role : null;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!role || !text) return apiError("INVALID_MESSAGE", "Wiadomość ma nieprawidłowy format.", 400);
  if (text.length > MAX_CONTEXT_CHARS) return apiError("MESSAGE_TOO_LONG", "Wiadomość jest za długa.", 400);

  const { id } = await params;
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ case_id: id, user_id: user.id, role, text })
    .select("id, role, text, created_at")
    .single();

  if (error) return apiError("DATABASE_ERROR", "Nie udało się zapisać wiadomości.", 500);
  return NextResponse.json({ message: data }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getUserAndClient();
  if (!user) return apiError("UNAUTHENTICATED", "Zaloguj siÄ™, aby usunÄ…Ä‡ historiÄ™ czatu.", 401);

  const { id } = await params;
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("case_id", id)
    .eq("user_id", user.id);

  if (error) return apiError("DATABASE_ERROR", "Nie udaĹ‚o siÄ™ usunÄ…Ä‡ historii czatu.", 500);
  return NextResponse.json({ success: true });
}
