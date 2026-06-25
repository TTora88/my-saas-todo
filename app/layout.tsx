import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "DoFlow - 일과 삶의 리듬",
  description: "할 일을 실행하고, 삶의 흐름을 찾으세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
