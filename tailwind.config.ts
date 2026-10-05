import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // buttons, 30% lighter than the stock palette
        green: { 600: "#5CBF80", 700: "#5BA677" },
        orange: { 500: "#FB9D5C", 600: "#F08A55" },
        red: { 600: "#E66767", 700: "#CE6060" },
        paper: "#F5F6F3",
        "paper-raised": "#FFFFFF",
        ink: "#14213D",
        "ink-soft": "#4B5568",
        "ink-faint": "#8A94A6",
        line: "#D8DCE1",
        accent: "#8A6D3B",
        "accent-soft": "#F7F3EB", // highlight, 50% lighter than before
        danger: "#A13D3D",
        "danger-soft": "#F8EEEE", // message boxes, 30% lighter
        success: "#2F6E52",
        "success-soft": "#EDF4F0",
      },
      fontFamily: {
        display: ["var(--font-source-serif)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};
export default config;
