import { handler } from "@/server/http";
import { publicBundleForSlug } from "@/server/services/public";
import { slugParams } from "@/server/public-params";


export const GET = handler({ summary: "Public booking bundle for a clinic slug: branding, published flow, bookable reasons, online providers, insurances, referrers", access: { kind: "public", rateLimit: "publicReadPerIp" }, params: slugParams }, async ({ params }) => {
  const { clinicId: _id, ...bundle } = await publicBundleForSlug(params.slug);
  return bundle;
});
