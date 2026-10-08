import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KotahBase Dashboard",
  description: "Backend platform for apps, websites & games"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
