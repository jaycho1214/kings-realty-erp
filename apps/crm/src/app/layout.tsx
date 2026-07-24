import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { LowPcSync } from "@/components/low-pc-sync";
import { LOW_PC_INIT_SCRIPT } from "@/lib/low-pc";
import "./globals.css";

const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "King's Realty CRM",
    template: "%s | King's Realty CRM",
  },
  description: "King's Realty 내부 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Resolves 저사양 모드 onto <html> before first paint so the mode
            never flashes. Must stay blocking and inline — see lib/low-pc.ts. */}
        <script dangerouslySetInnerHTML={{ __html: LOW_PC_INIT_SCRIPT }} />
      </head>
      <body
        className={`${pretendard.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LowPcSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
