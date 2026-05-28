import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import VishBubble from "@/components/VishBubble";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "PREVIS-LAB — AI Cinematic Previs Studio",
    template: "%s · PREVIS-LAB",
  },
  description:
    "From script to cinematic storyboard in seconds. AI-powered scene extraction, visual generation, timeline workflow, and VISH — your AI co-director.",
  keywords: [
    "storyboard", "previs", "AI storyboard", "cinematic", "film previs",
    "shot list", "screenwriting", "film production", "VISH", "AI director",
  ],
  authors: [{ name: "PREVIS-LAB" }],
  creator: "PREVIS-LAB",
  openGraph: {
    title: "PREVIS-LAB — AI Cinematic Previs Studio",
    description: "From script to cinematic storyboard in seconds. Powered by Gemini AI and VISH — your AI co-director.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PREVIS-LAB",
    description: "AI-powered cinematic previs. From script to storyboard in seconds.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col film-grain bg-[#060608]">
        {children}
        {/* Phase 15 — VISH floating bubble: visible on every page */}
        <VishBubble />
      </body>
    </html>
  );
}
