import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Relay Admin",
  description: "AI relay management dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
