import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import scrollbar from "tailwind-scrollbar";

export default {
  content: ["./src/**/*.tsx"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans), Plus Jakarta Sans"],
      },
      fontSize: {
        sm: "0.8rem",
      },
      boxShadow: {
        "3xl-dark": "0px 16px 70px rgba(0, 0, 0, 0.5)",
        "3xl-light":
          "rgba(0, 0, 0, 0.12) 0px 4px 30px, rgba(0, 0, 0, 0.04) 0px 3px 17px, rgba(0, 0, 0, 0.04) 0px 2px 8px, rgba(0, 0, 0, 0.04) 0px 1px 1px",
      },
      animation: {
        "border-spin": "border-spin 4s linear infinite",
        "fade-down": "fade-down 0.5s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        scroll: "scroll 40s linear infinite",
      },

      keyframes: {
        "border-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "fade-down": {
          "0%": {
            opacity: "0",
            transform: "translateY(-20px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        scroll: {
          "0%": {
            transform: "translateX(0)",
          },
          "100%": {
            transform: "translateX(calc(-50% - 1.5rem))",
          },
        },
      },
      colors: {
        "dark-50": "oklch(0.34 0 0)",
        "dark-100": "oklch(0.385 0 0)",
        "dark-200": "oklch(0.415 0 0)",
        "dark-300": "oklch(0.435 0 0)",
        "dark-400": "oklch(0.47 0 0)",
        "dark-500": "oklch(0.5 0 0)",
        "dark-600": "oklch(0.56 0 0)",
        "dark-700": "oklch(0.62 0 0)",
        "dark-800": "oklch(0.69 0 0)",
        "dark-900": "oklch(0.76 0 0)",
        "dark-950": "oklch(0.82 0 0)",
        "dark-1000": "oklch(0.85 0 0)",
        "light-50": "oklch(0.965 0 0)",
        "light-100": "oklch(0.945 0 0)",
        "light-200": "oklch(0.925 0 0)",
        "light-300": "oklch(0.91 0 0)",
        "light-400": "oklch(0.895 0 0)",
        "light-500": "oklch(0.87 0 0)",
        "light-600": "oklch(0.835 0 0)",
        "light-700": "oklch(0.8 0 0)",
        "light-800": "oklch(0.68 0 0)",
        "light-900": "oklch(0.55 0 0)",
        "light-950": "oklch(0.41 0 0)",
        "light-1000": "oklch(0.2 0 0)",
      },
      screens: {
        "2xl": "1600px",
      },
    },
  },
  plugins: [forms, scrollbar],
} satisfies Config;
