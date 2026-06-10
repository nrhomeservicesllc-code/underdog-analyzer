import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sharpdog.app"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "SharpDog — One Sharp Underdog Pick. Every Day.",
  description:
    "SharpDog finds the single best-value underdog bet across every sport, every day. Real bookmaker odds, vig stripped, edge calculated. Live and upcoming picks.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SharpDog",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "SharpDog — One Sharp Underdog Pick. Every Day.",
    description:
      "The single best-value underdog bet across every sport, every day. Vig stripped, edge calculated.",
    url: SITE_URL,
    siteName: "SharpDog",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SharpDog — One Sharp Underdog Pick. Every Day.",
    description: "The single best-value underdog bet across every sport, every day.",
    images: ["/og-image.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
