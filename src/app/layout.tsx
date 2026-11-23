import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
// Lora stands in for the design's Reckless display serif
const lora = Lora({ subsets: ["latin"], weight: "500", variable: "--serif" });

export const metadata: Metadata = {
  title: "Listing QC",
  description: "Review and approve generated product listing images",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* apply the saved light/dark choice before the first paint, so the page doesn't flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body className={`${inter.className} ${lora.variable}`}>{children}</body>
    </html>
  );
}
