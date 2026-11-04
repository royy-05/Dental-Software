import type { Referrer, Source, UtmTags } from "@/types";

export interface Attribution {
  source: Source;
  referrerId?: string;
  utm: UtmTags;
  gclid?: string;
  fbclid?: string;
}

type Params = { get(name: string): string | null };

/** Read referrer_id, UTM tags and click ids from the booking URL (spec section 7, Tracking). */
export function parseAttribution(params: Params, clinicId: string, referrers: Referrer[]): Attribution {
  const rid = params.get("referrer_id") ?? undefined;
  const ref = rid ? referrers.find((r) => r.clinicId === clinicId && r.id === rid) : undefined;
  const utm: UtmTags = {};
  for (const k of ["source", "medium", "campaign", "term", "content"] as const) {
    const v = params.get(`utm_${k}`);
    if (v) utm[k] = v.slice(0, 120);
  }
  return {
    source: ref ? ref.sourceType : "direct",
    referrerId: ref?.id,
    utm,
    gclid: params.get("gclid")?.slice(0, 200) || undefined,
    fbclid: params.get("fbclid")?.slice(0, 200) || undefined,
  };
}
