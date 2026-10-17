import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Poppins } from "next/font/google";
import "@/app/globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Boardroom Challenge · BOT Consulting",
  description: "Live event control for the BOT Consulting Boardroom Challenge.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#183944",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${poppins.variable}`}>
      <body className="bg-surface font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
