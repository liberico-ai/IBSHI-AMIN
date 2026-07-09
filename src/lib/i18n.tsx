"use client";

// Hệ thống đa ngôn ngữ nhẹ, không phụ thuộc URL locale. Dịch TỪNG CHỖ bằng
// t("tiếng Việt", "English") — cho phép chuyển dần từng module, chỗ nào chưa
// dịch (chưa truyền English) thì tự fallback về tiếng Việt.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "vi" | "en";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "vi",
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("vi");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ibs-lang");
      if (saved === "vi" || saved === "en") {
        setLangState(saved);
        document.documentElement.lang = saved;
      }
    } catch {}
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("ibs-lang", l);
      document.documentElement.lang = l;
    } catch {}
  }, []);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** t(vi, en?) → trả chuỗi theo ngôn ngữ hiện tại; thiếu `en` thì dùng `vi`. */
export function useT() {
  const { lang } = useLang();
  return useCallback(
    (vi: string, en?: string) => (lang === "en" && en != null ? en : vi),
    [lang]
  );
}
