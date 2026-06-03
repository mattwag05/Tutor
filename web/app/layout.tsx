import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Lora } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import ThemeScript from "@/components/ThemeScript";
import { AppShellProvider } from "@/context/AppShellContext";
import { I18nClientBridge } from "@/i18n/I18nClientBridge";
import { Toaster } from "sonner";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const fontSerif = Lora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Resize the layout viewport (not just the visual viewport) when the on-
  // screen keyboard opens so fixed-bottom elements (chat composer,
  // AdvanceBar, mobile nav) rise above the keyboard instead of sitting
  // behind it. Progressive enhancement: ignored by browsers that don't
  // support it.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Tutor",
  description: "Open-source AI lessons that keep you thinking",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${fontSans.variable} ${fontSerif.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans bg-[var(--background)] text-[var(--foreground)]">
        <AppShellProvider>
          <I18nClientBridge>{children}</I18nClientBridge>
          <Toaster
            position="bottom-right"
            mobileOffset={{
              bottom: "calc(3.5rem + env(safe-area-inset-bottom) + 0.5rem)",
              right: "0.5rem",
              left: "0.5rem",
            }}
          />
        </AppShellProvider>
      </body>
    </html>
  );
}
