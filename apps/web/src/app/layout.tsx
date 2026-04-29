import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FakeRadio",
  description: "本地优先的大模型个人音乐电台",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
