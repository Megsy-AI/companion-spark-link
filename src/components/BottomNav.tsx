import { Pickaxe, Sparkles, CircleCheckBig, Gem, WalletMinimal } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/routes";
import { useNavRevealed } from "@/hooks/use-nav-reveal";


const navItems = [
  { to: "/", icon: Pickaxe, label: "Mine" },
  { to: "/ai", icon: Sparkles, label: "AI" },
  { to: "/tasks", icon: CircleCheckBig, label: "Tasks" },
  { to: "/servers", icon: Gem, label: "Servers" },
  { to: "/wallet", icon: WalletMinimal, label: "Wallet" },
];

const ease = [0.22, 1, 0.36, 1] as const;

const BottomNav = () => {
  const location = useLocation();
  const revealed = useNavRevealed();
  const hidden = location.pathname.startsWith("/ai") && !revealed;

  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.nav
          key="bottom-nav"
          initial={{ y: 96, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 96, opacity: 0, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.7 }}
          className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)] pt-2"
        >
      <div className="mx-auto flex max-w-sm items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1.5 backdrop-blur-2xl shadow-[0_10px_30px_-16px_rgba(16,46,38,0.28)]">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));

          return (
            <motion.div key={item.to} className="flex-1" whileTap={{ scale: 0.92 }}>
            <Link
              to={item.to}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onMouseEnter={() => prefetchRoute(item.to)}
              onTouchStart={() => prefetchRoute(item.to)}
              className={cn(
                "relative flex h-11 w-full items-center justify-center gap-1.5 rounded-full transition-colors duration-200",
                isActive ? "text-primary-foreground" : "text-muted-foreground active:text-foreground"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full action-black"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    transition={{ duration: 0.22, ease }}
                    className="overflow-hidden whitespace-nowrap text-[11px] font-semibold tracking-tight"
                  >
                    {item.label}
                  </motion.span>
                )}
              </span>
            </Link>
            </motion.div>
          );
        })}
      </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
};

export default BottomNav;
