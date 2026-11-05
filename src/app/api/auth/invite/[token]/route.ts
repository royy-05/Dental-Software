import { z } from "zod";
import { handler } from "@/server/http";
import { acceptInvite, describeInvite } from "@/server/auth/accounts";

const params = z.object({ token: z.string().min(20).max(200) });

export const GET = handler({ summary: "Look up an invite (email and name) before accepting", access: { kind: "public", rateLimit: "passwordResetPerIp" }, params }, async ({ params }) =>
  describeInvite(params.token),
);

export const POST = handler(
  {
    summary: "Accept an invite: set name and password (password rules enforced)",
    access: { kind: "public", rateLimit: "passwordResetPerIp" },
    params,
    body: z.object({ password: z.string().min(1).max(256), name: z.string().max(120).optional() }),
  },
  async ({ params, body, ip }) => {
    await acceptInvite({ token: params.token, password: body.password, name: body.name, ip });
    return { ok: true };
  },
);
