/** Client IP from the proxy chain. Only the first X-Forwarded-For hop is used; set TRUST_PROXY=false to ignore it. */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "false") {
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
    const real = headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "unknown";
}

export function userAgent(headers: Headers): string {
  return (headers.get("user-agent") ?? "").slice(0, 256);
}
