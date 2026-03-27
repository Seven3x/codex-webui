import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#f4efe4",
        ink: "#181614",
        ember: "#d76c39",
        moss: "#7b8b63",
        slate: "#2d3748",
        panel: "#fffaf2",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;

