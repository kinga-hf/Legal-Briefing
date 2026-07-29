"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogIn, UserPlus } from "lucide-react";
import { createClient } from "../../lib/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router, supabase.auth]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data.session) {
        setMessage("Konto utworzone. Sprawdź skrzynkę e-mail i potwierdź adres.");
      } else {
        router.replace("/");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Nie udało się uwierzytelnić użytkownika.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#001730] px-4 py-10 text-slate-200">
      <section className="w-full max-w-md rounded-xl border border-[#C5A059]/30 bg-[#002147] p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Litigation Briefing Tool</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">
            {mode === "login" ? "Zaloguj się" : "Utwórz konto"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Twoje sprawy i historia czatu będą dostępne tylko dla Ciebie.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-950/30 px-3.5 py-3 text-sm text-red-200" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-lg border border-[#C5A059]/50 bg-[#C5A059]/10 px-3.5 py-3 text-sm text-[#f1d48d]" role="status">
            {message}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="auth-password">Hasło</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-[#C5A059]/30 bg-[#001730] px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[#C5A059] bg-[#002147] px-4 py-3.5 text-sm font-semibold text-[#C5A059] transition-all hover:bg-[#C5A059] hover:text-[#001730] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : mode === "login" ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            {mode === "login" ? "Zaloguj się" : "Utwórz konto"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setMessage("");
          }}
          className="mt-5 w-full text-center text-sm text-slate-400 transition hover:text-[#C5A059]"
        >
          {mode === "login" ? "Nie masz konta? Utwórz je" : "Masz już konto? Zaloguj się"}
        </button>
      </section>
    </main>
  );
}
