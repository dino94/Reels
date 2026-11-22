import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07111f",
        panel: "#0c1a2a",
        line: "#1d3448",
        muted: "#9aaec0",
        accent: "#3bd4ff",
        signal: "#ffb84d",
      },
      boxShadow: {
        glow: "0 0 40px rgba(59, 212, 255, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
