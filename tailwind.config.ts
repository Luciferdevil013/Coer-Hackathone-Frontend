import type { Config } from "tailwindcss";

// DataGuardian design tokens (from the team's Design canvas): near-black ground, bone text,
// lime accent for "good / keep", orange for risk, yellow for archive / warnings.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Helvetica Neue", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["var(--font-instrument)", "Georgia", "serif"],
      },
      colors: {
        ink: {
          950: "#0B0D0C", 925: "#0E100F", 900: "#101311", 875: "#111412", 850: "#131614",
          800: "#151915", 750: "#1A1E1B", 700: "#1C211D", 600: "#2A2F2B", 500: "#3A403B", 400: "#4A504B",
        },
        fg: { DEFAULT: "#ECEDE6", 2: "#C4C7BE", 3: "#A1A59B", 4: "#8C9087", ink: "#4A4E47" },
        lime: { DEFAULT: "#C9F25C" },
        risk: { DEFAULT: "#FF8A4C", soft: "#FFB48C" },
        warn: { DEFAULT: "#F2C94C" },
        line: { DEFAULT: "rgba(236,237,230,0.08)", 2: "rgba(236,237,230,0.14)", 3: "rgba(236,237,230,0.25)" },
      },
      borderRadius: { card: "18px", panel: "24px" },
      keyframes: {
        dgMarquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        dgScan: { "0%": { left: "0%" }, "100%": { left: "100%" } },
        dgPulse: { "0%,100%": { opacity: "1", transform: "scale(1)" }, "50%": { opacity: ".3", transform: "scale(.6)" } },
        dgRise: { from: { opacity: "0", transform: "translateY(28px)" }, to: { opacity: "1", transform: "none" } },
        dgStrike: { "0%,35%": { width: "0" }, "55%,100%": { width: "100%" } },
        dgLoad: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(250%)" } },
        dgFade: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        marquee: "dgMarquee 48s linear infinite",
        scan: "dgScan 5s cubic-bezier(.65,0,.35,1) infinite alternate",
        pulsedot: "dgPulse 1.6s ease-in-out infinite",
        rise: "dgRise 1s cubic-bezier(.2,.7,.2,1) both",
        rise2: "dgRise 1s .15s cubic-bezier(.2,.7,.2,1) both",
        rise3: "dgRise 1s .3s cubic-bezier(.2,.7,.2,1) both",
        strike: "dgStrike 4.5s ease-in-out infinite",
        load: "dgLoad 1.2s ease-in-out infinite",
        view: "dgFade .45s cubic-bezier(.2,.7,.2,1) backwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
