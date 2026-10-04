import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#07070f",
        neon: { indigo: "#6366f1", violet: "#8b5cf6", cyan: "#22d3ee" }
      },
      borderRadius: { "2xl": "1.25rem" },
      boxShadow: { glass: "0 8px 40px rgba(99,102,241,.25)" },
      backdropBlur: { xs: "2px" }
    }
  },
  plugins: []
};
export default config;
