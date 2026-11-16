import { Link } from "@tanstack/react-router";
import SideNav from "@/components/layout/SideNav";
import BottomNav from "@/components/layout/BottomNav";
import { useWallet } from "@/lib/useWallet";

export default function AppShell({ children }) {
  const { coins, level } = useWallet();

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <SideNav coins={coins} level={level} />
        <main className="flex min-h-screen w-full flex-1 border-border/50 pb-24 lg:border-x lg:pb-0">
          <div className="flex w-full flex-col">
            <div className="flex-1">{children}</div>
            <footer className="mt-10 border-t border-border/50 px-4 py-6 text-center lg:px-8">
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                PURRE PETS · purrepets.pl
              </p>
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                <Link to="/terms" className="hover:text-foreground">
                  Regulamin
                </Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy" className="hover:text-foreground">
                  Polityka prywatności (RODO)
                </Link>
                <span aria-hidden="true">·</span>
                <span>Płatności: Stripe · PLN</span>
              </div>
            </footer>
          </div>
        </main>
      </div>
         <BottomNav />
    </div>
  );
}
