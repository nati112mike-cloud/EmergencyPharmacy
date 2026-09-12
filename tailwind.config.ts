import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf5",
          100: "#d6f5e5",
          500: "#12946f",
          600: "#0d7d5c",
          700: "#0a6249",
        },
      },
    },
  },
  plugins: [],
};
export default config;
