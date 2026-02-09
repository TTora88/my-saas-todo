import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="ko">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
