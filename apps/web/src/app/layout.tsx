import type { Metadata } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "./_components/service-worker-registration";

export const metadata: Metadata = {
  title: "FakeRadio",
  description: "本地优先的大模型个人音乐电台",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&family=Noto+Serif+SC:wght@300;400;500;600&family=Noto+Sans+SC:wght@300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
