import type React from "react"
import type { Metadata } from "next"
import { Montserrat, Playfair_Display } from "next/font/google"
import "./globals.css"
import { Analytics } from '@vercel/analytics/react'

const montserrat = Montserrat({ subsets: ["latin"] })
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })

export const metadata: Metadata = {
  title: "APEX",
  description: "AI for PRM Experience & Execution — voice assistant for Schiphol Airport",
  keywords: "Schiphol, airport, flight, AI, voice assistant, PRM, reduced mobility",
  generator: 'v0.dev',
  // Add these for iOS full-screen
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "APEX",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* iOS full-screen web app mode */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="APEX" />

        {/* Prevent iOS Safari from adding margins */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className={`${montserrat.className} ${playfair.variable}`}>
        {children}
      <Analytics />
      </body>
    </html>
  )
}
