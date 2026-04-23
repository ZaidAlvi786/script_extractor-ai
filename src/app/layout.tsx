import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { createClient } from "@/lib/supabase-server";
import Header from "@/components/Header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CreatorAI Engine | Viral Instagram Content",
  description: "Generate viral Instagram content and scripts in seconds with AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <Header user={user} />
        <main className="pt-20">
          {children}
        </main>
      </body>
    </html>
  );
}

