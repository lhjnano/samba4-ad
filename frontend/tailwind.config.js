/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface
        root: "#0d1117",
        card: "#161b22",
        sidebar: "#1c2128",
        input: "#0d1117",
        hover: "#21262d",
        active: "#1f3244",
        // Border
        border: "#30363d",
        "border-subtle": "#21262d",
        // Text
        primary: "#e6edf3",
        secondary: "#8b949e",
        muted: "#484f58",
        // Accents
        blue: "#3b82f6",
        green: "#10b981",
        yellow: "#f59e0b",
        red: "#ef4444",
        purple: "#7c3aed",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      fontSize: {
        xxs: "11px",
      },
    },
  },
  plugins: [],
};
