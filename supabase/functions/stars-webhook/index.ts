import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { starsApi, STARS_PRODUCTS } from "../_shared/stars.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const update = await req.json();

    if (update.pre_checkout_query) {
      await starsApi("answerPreCheckoutQuery", {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true,
      });
      return new Response(JSON.stringify({ ok: true }));
    }

    const payment = update.message?.successful_payment;
    if (!payment) return new Response(JSON.stringify({ ok: true, ignored: true }));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = String(payment.invoice_payload ?? "");
    const { data: rows } = await supabase
      .from("star_payments")
      .select("*")
      .eq("payload", payload)
      .limit(1);
    const row = rows?.[0];

    if (!row || row.status === "paid") {
      return new Response(JSON.stringify({ ok: true, duplicate: true }));
    }

    if (String(row.product).startsWith("server:")) {
      const serverId = String(row.product).slice("server:".length);
      const { data: server } = await supabase
        .from("servers")
        .select("price_ton")
        .eq("id", serverId)
        .maybeSingle();
      await supabase.rpc("purchase_server_for_telegram", {
        _telegram_id: row.telegram_id,
        _server_id: serverId,
        _ton_paid: Number(server?.price_ton ?? 0),
        _wallet_address: null,
        _tx_hash: payment.telegram_payment_charge_id ?? null,
      });
    }

    const product = STARS_PRODUCTS[row.product];
    if (product) {
      if (product.aiPro) {
        await supabase.rpc("ai_activate_plan", {
          _profile_id: row.profile_id,
          _plan: "unlimited",
          _price: 0,
        });
      }
      if (product.usdt > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("usdt_balance")
          .eq("id", row.profile_id)
          .maybeSingle();
        await supabase
          .from("profiles")
          .update({ usdt_balance: Number(profile?.usdt_balance ?? 0) + product.usdt })
          .eq("id", row.profile_id);
      }
    }

    await supabase
      .from("star_payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        charge_id: payment.telegram_payment_charge_id ?? null,
        meta: payment,
      })
      .eq("id", row.id);

    await starsApi("sendMessage", {
      chat_id: update.message.chat.id,
      text: `✅ Payment received — ${product?.title ?? row.product} is now active.`,
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("stars-webhook failed:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
