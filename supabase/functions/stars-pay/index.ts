import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, starsApi, STARS_BOT_TOKEN, STARS_PRODUCTS, starsForTon } from "../_shared/stars.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!STARS_BOT_TOKEN) return json({ error: "STARS_BOT_TOKEN is not configured" }, 500);

    const body = await req.json().catch(() => ({}));

    // Make sure the stars bot (@Goaccbot) delivers payment updates to us.
    const ensureWebhook = async () => {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stars-webhook`;
      const info = await starsApi("getWebhookInfo", {}).catch(() => null);
      if ((info as { url?: string } | null)?.url === url) return { url, changed: false };
      await starsApi("setWebhook", {
        url,
        allowed_updates: ["pre_checkout_query", "message"],
      });
      return { url, changed: true };
    };

    if (body.action === "setup") {
      return json({ ok: true, ...(await ensureWebhook()) });
    }

    if (body.action === "products") return json({ products: Object.values(STARS_PRODUCTS) });

    const profileId = typeof body.profileId === "string" ? body.profileId : null;
    const telegramId = Number(body.telegramId) || null;
    if (!profileId) return json({ error: "Missing profile" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const requested = String(body.product ?? "");
    let product = STARS_PRODUCTS[requested];

    // Dynamic product: buying a mining server with Stars.
    if (!product && requested === "server") {
      const serverId = String(body.serverId ?? "");
      if (!serverId) return json({ error: "Missing serverId" }, 400);
      const { data: server } = await supabase
        .from("servers")
        .select("id, name, price_ton, is_active")
        .eq("id", serverId)
        .maybeSingle();
      if (!server || !server.is_active) return json({ error: "Server not found" }, 404);
      product = {
        id: `server:${server.id}`,
        title: `${server.name} — mining server`,
        description: `Unlock the ${server.name} mining server.`,
        stars: starsForTon(Number(server.price_ton)),
        usdt: 0,
      };
    }

    if (!product) return json({ error: "Unknown product" }, 400);

    const payload = `${product.id}:${crypto.randomUUID()}`;

    await ensureWebhook().catch((e) => console.error("ensureWebhook failed:", e));

    const { error } = await supabase.from("star_payments").insert({
      profile_id: profileId,
      telegram_id: telegramId,
      product: product.id,
      stars: product.stars,
      payload,
      status: "pending",
    });
    if (error) return json({ error: error.message }, 500);

    const link = await starsApi("createInvoiceLink", {
      title: product.title,
      description: product.description,
      payload,
      currency: "XTR",
      prices: [{ label: product.title, amount: product.stars }],
    });

    return json({ url: link, payload, stars: product.stars });
  } catch (e) {
    console.error("stars-pay failed:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
