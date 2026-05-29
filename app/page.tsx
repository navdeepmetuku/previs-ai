import type { Metadata } from "next";
import HeroClient from "@/components/HeroClient";

export const metadata: Metadata = {
  title: "PREVIS AI — Cinematic Storyboard Intelligence",
  description:
    "From screenplay to cinematic storyboard. PREVIS AI understands your script, preserves continuity, and generates real film stills — powered by VISH, your AI co-director.",
};

export default function LandingPage() {
  return <HeroClient />;
}
