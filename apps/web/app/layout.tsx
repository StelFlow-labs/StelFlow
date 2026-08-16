import type { Metadata, Viewport } from "next";

import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "StelFlow — payment streaming with milestone gates",
  description:
    "Stream payments continuously on Stellar, with tranches gated behind milestone approvals. Non-upgradeable, running on testnet.",
  applicationName: "StelFlow",
  openGraph: {
    title: "StelFlow",
    description:
      "Payment streaming with milestone gates, on Stellar. Non-upgradeable, testnet.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101010" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
