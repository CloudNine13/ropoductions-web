import { Chakra_Petch, Geist, Geist_Mono } from "next/font/google";

export const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  variable: "--font-chakra-petch",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Backward-compatible alias for any legacy imports
export const cinzel = chakraPetch;

export const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
