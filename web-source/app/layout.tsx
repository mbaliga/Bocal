import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RuntimeSafety } from "./RuntimeSafety";
import "./globals.css";
import "./styles/contrast.css";
import "./styles/compact-layout.css";
import { THEME_STORAGE_KEY } from "./storage-keys";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Inlined as a <script> string, not executed as a module import, so the
// constant is interpolated in rather than referenced -- storage-keys.ts
// still stays this key's single source of truth.
const themeBootstrap = `(() => {
  try {
    const saved = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();`;

export const metadata: Metadata = {
  title: "Bocal — The clearer way to practise",
  description: "A private, instrument-first practice studio for woodwind players, with a cinematic path into other instrument families.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export const viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover" as const,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#060607" },
  ],
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body className={`${geistSans.variable} ${geistMono.variable}`} style={{ paddingTop: "env(safe-area-inset-top)" }}><RuntimeSafety>{children}</RuntimeSafety></body></html>;
}
