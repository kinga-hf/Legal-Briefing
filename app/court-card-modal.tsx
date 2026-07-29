"use client";

import { Check, Copy, Gavel, ListChecks, MessageSquareText, Printer, Smartphone, X } from "lucide-react";
import { useState } from "react";

export type CourtCardData = {
  coreDispute: string;
  topWeaknesses: string[];
  quickReplies: Array<{ question: string; answer: string }>;
  mustAskWitnessQuestions: string[];
};

function courtCardText(card: CourtCardData) {
  return [
    "FISZKA NA ROZPRAWĘ",
    "",
    "ISTOTA SPORU",
    card.coreDispute,
    "",
    "NAJSŁABSZE PUNKTY PRZECIWNIKA",
    ...card.topWeaknesses.map((item, index) => `${index + 1}. ${item}`),
    "",
    "PRAWDOPODOBNE PYTANIA SĘDZIEGO I SZYBKIE RIPOSTY",
    ...card.quickReplies.flatMap((item, index) => [
      `${index + 1}. Pytanie: ${item.question}`,
      `   Riposta: ${item.answer}`,
    ]),
    "",
    "PYTANIA, KTÓRE WARTO ZADAĆ ŚWIADKOM",
    ...card.mustAskWitnessQuestions.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n");
}

export default function CourtCardModal({
  courtCard,
  open,
  onClose,
}: {
  courtCard: CourtCardData | null;
  open: boolean;
  onClose: () => void;
}) {
  const [isCopied, setIsCopied] = useState(false);

  if (!open || !courtCard) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(courtCardText(courtCard));
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1800);
  };

  return (
    <div className="court-card-modal fixed inset-0 z-50 flex items-center justify-center bg-[#001730]/90 p-3 backdrop-blur-sm sm:p-6">
      <button type="button" aria-label="Zamknij fiszkę" className="court-card-backdrop absolute inset-0 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="court-card-title"
        className="court-card-sheet relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#C5A059]/60 bg-[#002147] shadow-2xl shadow-black/40"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#C5A059]/30 px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-[#C5A059]/50 bg-[#001730] p-2.5 text-[#C5A059]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Court Card</p>
              <h2 id="court-card-title" className="mt-1 text-xl font-semibold text-white">Fiszka na Rozprawę</h2>
              <p className="mt-1 text-xs text-slate-400">Szybkie przypomnienie najważniejszych tez przed wejściem na salę.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="court-card-actions rounded-md p-2 text-slate-400 transition hover:bg-[#001730] hover:text-[#C5A059]" aria-label="Zamknij fiszkę">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <section className="rounded-xl border border-[#C5A059]/50 bg-[#001730] p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2 text-[#C5A059]">
              <Gavel className="h-4 w-4" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-[0.16em]">Istota sporu</h3>
            </div>
            <p className="text-base font-medium leading-7 text-white sm:text-lg">{courtCard.coreDispute}</p>
          </section>

          <section className="rounded-xl border border-[#C5A059]/25 bg-[#001730]/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-[#C5A059]">
              <Gavel className="h-4 w-4" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-[0.16em]">Najsłabsze punkty przeciwnika</h3>
            </div>
            <ol className="space-y-2">
              {courtCard.topWeaknesses.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6 text-slate-200">
                  <span className="font-semibold text-[#C5A059]">{index + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-[#C5A059]/25 bg-[#001730]/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-[#C5A059]">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-[0.16em]">Pytania sędziego i szybkie riposty</h3>
            </div>
            <div className="space-y-3">
              {courtCard.quickReplies.map((item, index) => (
                <article key={`${item.question}-${index}`} className="rounded-lg border border-[#C5A059]/20 bg-[#002147] p-3.5">
                  <p className="text-sm font-semibold leading-6 text-white">{item.question}</p>
                  <p className="mt-2 border-l-2 border-[#C5A059] pl-3 text-sm leading-6 text-[#f1d48d]">{item.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#C5A059]/25 bg-[#001730]/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-[#C5A059]">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-[0.16em]">Pytania do świadków</h3>
            </div>
            <ol className="space-y-2">
              {courtCard.mustAskWitnessQuestions.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6 text-slate-200">
                  <span className="font-semibold text-[#C5A059]">{index + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <footer className="court-card-actions flex flex-col-reverse gap-2 border-t border-[#C5A059]/30 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={() => void handleCopy()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#C5A059]/60 bg-[#001730] px-4 py-2.5 text-sm font-medium text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#001730]">
            {isCopied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {isCopied ? "Skopiowano" : "Kopiuj treść"}
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[#C5A059] bg-[#C5A059] px-4 py-2.5 text-sm font-semibold text-[#001730] transition hover:bg-[#f1d48d]">
            <Printer className="h-4 w-4" aria-hidden="true" />
            Drukuj / Pobierz Fiszkę
          </button>
        </footer>
      </section>
    </div>
  );
}
