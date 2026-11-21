import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Produk",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
