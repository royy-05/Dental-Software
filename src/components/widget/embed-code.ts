import type { Clinic } from "@/types";

/** Website embed snippets for a clinic (spec section 3, "Delivery and design"). */
export function embedSnippets(clinic: Clinic, origin: string): { link: string; inline: string; popup: string; floating: string } {
  const slug = clinic.settings.widget.customSlug || clinic.slug;
  const link = `${origin}/book/${slug}`;
  const color = clinic.branding.primaryColor;
  const inline = `<iframe src="${link}?embed=1&referrer_id=4" title="Book an appointment with ${clinic.name}" style="width:100%;min-height:760px;border:0;border-radius:12px" loading="lazy"></iframe>`;
  const popup = `<button type="button" onclick="kiviOpen()" style="background:${color};color:#fff;border:0;border-radius:8px;padding:12px 20px;font:600 16px system-ui">Book Online</button>
<script>
function kiviOpen(){var o=document.createElement('div');o.setAttribute('role','dialog');o.setAttribute('aria-label','Book an appointment');
o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646;display:flex;align-items:center;justify-content:center';
o.innerHTML='<div style="background:#fff;border-radius:12px;width:min(720px,94vw);height:min(820px,92vh);position:relative"><button aria-label="Close" style="position:absolute;right:8px;top:8px;border:0;background:#fff;font-size:22px;cursor:pointer">&times;</button><iframe src="${link}?embed=1&referrer_id=4" title="Booking" style="width:100%;height:100%;border:0;border-radius:12px"></iframe></div>';
o.querySelector('button').onclick=function(){o.remove()};o.onclick=function(e){if(e.target===o)o.remove()};document.body.appendChild(o);}
</script>`;
  const floating = `<script>
(function(){var b=document.createElement('button');b.textContent='Book Online';b.setAttribute('aria-label','Book Online with ${clinic.name}');
b.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483645;background:${color};color:#fff;border:0;border-radius:999px;padding:14px 22px;font:600 16px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer';
b.onclick=function(){window.open('${link}?referrer_id=4','kivi-booking','width=480,height=820')};document.body.appendChild(b);})();
</script>`;
  return { link, inline, popup, floating };
}
