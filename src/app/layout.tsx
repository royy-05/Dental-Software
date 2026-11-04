import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppProviders } from "@/components/shared/hydration";

export const metadata: Metadata = {
  title: { default: "Kivi Health Booking", template: "%s · Kivi Health" },
  description: "Clickable prototype of a multi-clinic healthcare appointment booking platform. Demo data only.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <AppProviders>
          <Suspense>{children}</Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
