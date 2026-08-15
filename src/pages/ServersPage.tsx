import SpotlightHero from "@/components/hero/SpotlightHero";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import ServerArtwork from "@/components/ServerArtwork";
import CreateNftButton from "@/components/CreateNftButton";
import { swr } from "@/lib/cache";
import CachedImage from "@/components/CachedImage";
import { payWithStars, starsForTon } from "@/lib/stars";
import TelegramStar from "@/components/TelegramStar";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { PaymentError, sendTonPayment } from "@/lib/ton";
import { purchaseServerForTelegram, verifyTonOnChain } from "@/lib/game-api";


const TON_ICON = "/images/gram-icon.png";
const USDT_ICON = "/images/usdt.png";


interface Server {
  id: string;
  name: string;
  image_url: string;
  price_ton: number;
  rarity: string;
  mining_boost: number | null;
  attack_boost: number | null;
  ton_mining_rate: number | null;
  usdt_mining_rate: number | null;
}


const ServersPage = () => {
  const { user, refreshProfile } = useApp();
  const { toast } = useToast();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [myNfts, setMyNfts] = useState<{ id: string; name: string; image_url: string }[]>([]);
  const [starBusy, setStarBusy] = useState<string | null>(null);
  const [tonBusy, setTonBusy] = useState<string | null>(null);
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();


  useEffect(() => { void loadServers(); void loadMyNfts(); }, []);

  const loadServers = async () => {
    await swr<Server[]>(
      "servers",
      async () => {
        const { data } = await supabase.from("servers").select("*").eq("is_active", true).order("price_ton", { ascending: true });
        return (data || []) as Server[];
      },
      (rows) => {
        setServers(rows);
        setLoading(false);
      },
      10 * 60 * 1000,
    );
    setLoading(false);
  };

  const loadMyNfts = async () => {
    const { data } = await supabase
      .from("user_nfts")
      .select("id, name, image_url")
      .eq("telegram_id", user.telegramUser.id)
      .order("created_at", { ascending: false });
    if (data) setMyNfts(data);
  };


  const handleBuyWithStars = async (server: Server) => {
    setStarBusy(server.id);
    try {
      const status = await payWithStars("server", user.profileId, user.telegramUser.id, {
        serverId: server.id,
      });
      if (status === "paid") {
        await refreshProfile();
        toast({ title: "Purchase complete", description: `${server.name} added successfully` });
      } else if (status === "cancelled") {
        toast({ title: "Payment cancelled" });
      } else {
        toast({ title: "Finish the payment in Telegram" });
      }
    } catch (err) {
      toast({
        title: "Stars payment failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setStarBusy(null);
    }
  };

  const handleBuyWithTon = async (server: Server) => {
    const price = Number(server.price_ton);
    setTonBusy(server.id);
    try {
      const transaction = await sendTonPayment(tonConnectUI, {
        amountTon: price,
        comment: `Nova ${server.name}`,
      });

      toast({ title: "Verifying payment...", description: "Checking blockchain confirmation" });
      const verification = await verifyTonOnChain(price, transaction.boc, tonConnectUI.account?.address);
      if (!verification.verified) {
        toast({ title: "Verification failed", description: "Transaction not found on blockchain.", variant: "destructive" });
        return;
      }

      await purchaseServerForTelegram({
        telegramId: user.telegramUser.id,
        serverId: server.id,
        tonPaid: price,
        walletAddress,
        txHash: verification.tx_hash || transaction?.boc,
      });

      await refreshProfile();
      toast({ title: "Purchase complete", description: `${server.name} added successfully` });
    } catch (err) {
      if (err instanceof PaymentError) {
        toast({
          title: err.code === "not_connected" ? "Wallet not connected" : "Payment failed",
          description: err.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Purchase failed", description: "Please try again", variant: "destructive" });
    } finally {
      setTonBusy(null);
    }
  };



  if (loading) {
    return <div className="min-h-screen bg-gradient-dark flex items-center justify-center"><div className="text-muted-foreground font-display animate-pulse">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-dark pb-24">
      <SpotlightHero title="Servers">
      <div className="px-4 pt-8">

      <div className="mb-4">
        <CreateNftButton onCreated={() => void loadMyNfts()} />
      </div>

      {myNfts.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-display uppercase tracking-widest text-muted-foreground">Your Creations</h2>
          <div className="grid grid-cols-2 gap-3">
            {myNfts.map((n) => (
              <div key={n.id} className="glass rounded-2xl p-3">
                <CachedImage src={n.image_url} alt={n.name} className="mb-2 w-full rounded-xl object-cover" />
                <p className="text-center text-xs font-display font-bold text-foreground">{n.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}


      {servers.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No servers available</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {servers.map((server, i) => (
            <motion.div key={server.id} className="glass rounded-2xl p-3 flex flex-col"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <ServerArtwork name={server.name} imageUrl={server.image_url} rarity={server.rarity} className="my-3" />
              <h3 className="text-xs font-display font-bold text-foreground text-center mb-2">{server.name}</h3>
              <div className="space-y-1 mb-3 text-[10px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Mining +{server.mining_boost || 0}%</span>
                  <span>Atk +{server.attack_boost || 0}%</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span className="text-ton-blue flex items-center gap-0.5">
                    <img src={TON_ICON} alt="Gram" className="w-3 h-3 rounded-full"  loading="lazy" decoding="async" />
                    +{server.ton_mining_rate || 0}/d
                  </span>
                  <span className="text-neon-green flex items-center gap-0.5">
                    <img src={USDT_ICON} alt="USDT" className="w-3 h-3"  loading="lazy" decoding="async" />
                    +{server.usdt_mining_rate || 0}/d
                  </span>
                </div>
              </div>
              <div className="mt-auto space-y-1.5">
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl font-display text-xs"
                onClick={() => void handleBuyWithTon(server)}
                disabled={tonBusy === server.id}
              >
                {tonBusy === server.id ? (
                  <span className="animate-pulse">Processing…</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <img src={TON_ICON} alt="Gram" className="w-3 h-3 rounded-full" loading="lazy" decoding="async" />
                    {Number(server.price_ton)} TON
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                className="w-full rounded-xl font-display text-xs glow-primary"

                onClick={() => void handleBuyWithStars(server)}
                disabled={starBusy === server.id}
              >
                {starBusy === server.id ? (
                  <span className="animate-pulse">Opening…</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <TelegramStar className="h-3 w-3" />
                    {starsForTon(Number(server.price_ton)).toLocaleString()} Stars
                  </span>
                )}
              </Button>
              </div>
            </motion.div>

          ))}
        </div>
      )}
      </div>
      </SpotlightHero>
    </div>
  );
};

export default ServersPage;
