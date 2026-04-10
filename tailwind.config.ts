import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core
        background: "var(--background)",
        foreground: "var(--foreground)",
        // IBS Design System
        "ibs-primary": "var(--ibs-primary)",
        "ibs-primary-light": "var(--ibs-primary-light)",
        "ibs-primary-dark": "var(--ibs-primary-dark)",
        "ibs-accent": "var(--ibs-accent)",
        "ibs-success": "var(--ibs-success)",
        "ibs-warning": "var(--ibs-warning)",
        "ibs-danger": "var(--ibs-danger)",
        "ibs-bg": "var(--ibs-bg)",
        "ibs-bg-card": "var(--ibs-bg-card)",
        "ibs-bg-card-hover": "var(--ibs-bg-card-hover)",
        "ibs-bg-sidebar": "var(--ibs-bg-sidebar)",
        "ibs-text": "var(--ibs-text)",
        "ibs-text-muted": "var(--ibs-text-muted)",
        "ibs-text-dim": "var(--ibs-text-dim)",
        "ibs-border": "var(--ibs-border)",
        // shadcn
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        "stat": ["28px", { fontWeight: "800" }],
        "page-title": ["22px", { fontWeight: "700" }],
        "card-title": ["14px", { fontWeight: "600" }],
        "body": ["13px", {}],
        "label": ["12px", {}],
        "caption": ["11px", {}],
        "badge": ["11px", { fontWeight: "600" }],
      },
      width: {
        "sidebar": "260px",
      },
      height: {
        "header": "60px",
      },
      spacing: {
        "content": "24px",
      },
    },
  },
  plugins: [],
};
export default config;
