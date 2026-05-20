import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        miel: {
          bg: "rgb(var(--miel-bg) / <alpha-value>)",
          panel: "rgb(var(--miel-panel) / <alpha-value>)",
          ink: "rgb(var(--miel-ink) / <alpha-value>)",
          muted: "rgb(var(--miel-muted) / <alpha-value>)",
          line: "rgb(var(--miel-line) / <alpha-value>)",
          accent: "rgb(var(--miel-accent) / <alpha-value>)",
          high: "rgb(var(--miel-high) / <alpha-value>)",
          medium: "rgb(var(--miel-medium) / <alpha-value>)",
          low: "rgb(var(--miel-low) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
