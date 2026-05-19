import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        miel: {
          bg: "#fafaf7",
          panel: "#ffffff",
          ink: "#1a1a1a",
          muted: "#6b6b6b",
          line: "#e6e6e0",
          accent: "#b8860b",
          high: "#c73e3e",
          medium: "#c98429",
          low: "#5d9c5b",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
