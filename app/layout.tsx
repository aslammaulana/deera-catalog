import type { Metadata } from "next";
import "./globals.css";
import { PROFILE } from "@/config/profile";

export const metadata: Metadata = {
  title: PROFILE.name,
  description: "Daftar produk yang dibahas di video TikTok.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
