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
        background: {
          DEFAULT: "#090A0F",
          secondary: "#0F111A",
        },
        foreground: "#F8FAFC",
        muted: {
          DEFAULT: "#1A1D2B",
          foreground: "#94A3B8",
        },
        card: {
          DEFAULT: "#121522",
          foreground: "#F1F5F9",
        },
        border: "#23283E",
        input: "#1A1E2F",
        ring: "#22C55E",
        destructive: "#E11D48",
        primary: {
          DEFAULT: "#22C55E",
          foreground: "#090A0F",
          hover: "#16A34A",
        },
        accent: {
          DEFAULT: "#F59E0B",
          foreground: "#090A0F",
        },
        "tier-gold": {
          DEFAULT: "#FBBF24",
          foreground: "#181204",
        },
        "comp-blue": "#38BDF8",
      },
      fontFamily: {
        display: ["var(--font-chakra-petch)", "Chakra Petch", "sans-serif"],
        body: ["var(--font-geist-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        "2xl": "16px",
        full: "9999px",
      },
      spacing: {
        "touch-target": "44px",
        "hud-dock": "64px",
      },
    },
  },
  plugins: [],
};

export default config;
