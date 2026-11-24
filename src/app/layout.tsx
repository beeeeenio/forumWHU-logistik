import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// Jost = genehmigter Web-Ersatz für Futura (Design System). Wird beim Build selbst gehostet, keine Anfrage an Google im Betrieb.
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "forumWHU Logistik", template: "%s · forumWHU Logistik" },
  description: "Bestand, Lagerorte, Bewegungen und Leergut für den forumWHU-Kongress",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Logistik", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e6" },
    { media: "(prefers-color-scheme: dark)", color: "#040e26" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" suppressHydrationWarning className={`${jost.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
