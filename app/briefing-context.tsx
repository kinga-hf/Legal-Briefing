"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

type BriefingContextValue = {
  caseId: string | null;
  setCaseId: (value: string | null) => void;
  documentType: string;
  setDocumentType: (value: string) => void;
  text: string;
  setText: (value: string) => void;
  fileName: string;
  setFileName: (value: string) => void;
  documentFile: File | null;
  setDocumentFile: (value: File | null) => void;
  documentFileUrl: string | null;
  setDocumentFileUrl: (value: string | null) => void;
};

const BriefingContext = createContext<BriefingContextValue | undefined>(undefined);

export function BriefingProvider({ children }: { children: ReactNode }) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState("Sprzeciw od nakazu zapłaty");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentFileUrl, setDocumentFileUrl] = useState<string | null>(null);

  const value = useMemo(
    () => ({ caseId, setCaseId, documentType, setDocumentType, text, setText, fileName, setFileName, documentFile, setDocumentFile, documentFileUrl, setDocumentFileUrl }),
    [caseId, documentType, text, fileName, documentFile, documentFileUrl],
  );

  return <BriefingContext.Provider value={value}>{children}</BriefingContext.Provider>;
}

export function useBriefing() {
  const context = useContext(BriefingContext);
  if (!context) {
    throw new Error("useBriefing musi być użyty wewnątrz BriefingProvider.");
  }
  return context;
}
