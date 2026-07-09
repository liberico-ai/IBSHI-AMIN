"use client";

// Chuyển đổi Sáng/Tối bằng thuộc tính data-theme trên <html>. Các biến CSS
// --ibs-* trong globals.css sẽ đổi theo (khối [data-theme="dark"]). Lưu lựa
// chọn ở localStorage (theo trình duyệt), không đụng database.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    let t: Theme = "light";
    try {
      const saved = localStorage.getItem("ibs-theme");
      if (saved === "dark" || saved === "light") t = saved;
    } catch {}
    setThemeState(t);
    document.documentElement.dataset.theme = t;
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("ibs-theme", t);
    } catch {}
    document.documentElement.dataset.theme = t;
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
