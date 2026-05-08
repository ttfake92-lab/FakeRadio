"use client";

import type { Metadata } from "next";
import { useEffect } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FakeRadio",
  description: "本地优先的大模型个人音乐电台",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.warn);
    }
  }, []);

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
