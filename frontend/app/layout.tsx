import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import Nav from "./components/Nav";
import { ModeProvider } from "./lib/mode";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Airline On-Time Performance",
  description:
    "US airline on-time performance, 2018-present, sourced directly from the DOT Bureau of Transportation Statistics. Carrier comparisons, delay trends, and coded delay causes.",
  openGraph: {
    title: "Airline On-Time Performance",
    description: "US airline on-time performance, 2018-present, from DOT/BTS data.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <ModeProvider>
          <Nav />
          {children}
        </ModeProvider>
      </body>
    </html>
  );
}
