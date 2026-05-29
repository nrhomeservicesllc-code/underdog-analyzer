import { NextResponse } from "next/server"

// Generates a simple SVG icon served as PNG placeholder
export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#09090b"/>
  <text x="256" y="340" font-family="system-ui,sans-serif" font-size="300" font-weight="900" text-anchor="middle" fill="#10b981">U</text>
  <circle cx="370" cy="160" r="24" fill="#10b981"/>
</svg>`
  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  })
}
