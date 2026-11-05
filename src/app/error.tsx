"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console without sensitive patient data
    console.error("Global application error caught by boundary:", error.message);
  }, [error]);

  const isDbDown =
    error.message.includes("database") ||
    error.message.includes("P1001") ||
    error.message.includes("P1000") ||
    error.message.includes("connection failed") ||
    error.message.includes("Can't reach database");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {isDbDown ? "Service Temporarily Unavailable" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDbDown
            ? "We are currently having trouble connecting to our database server. Please ensure the database is running or try again in a few moments."
            : "An unexpected error occurred while loading this page. Please try again."}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/" className="gap-2">
              <Home className="h-4 w-4" aria-hidden /> Go to Home
            </Link>
          </Button>
        </div>

        {process.env.NODE_ENV === "development" && error.message && (
          <div className="mt-6 rounded-md bg-slate-100 p-3 text-left">
            <p className="text-xs font-mono text-slate-700 break-all">{error.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
