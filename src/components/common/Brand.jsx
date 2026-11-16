import { useNavigate } from "@tanstack/react-router";
import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Brand({ compact = false, onClick }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (onClick ? onClick() : navigate({ to: "/" }))}
      className="group flex items-center gap-3 text-left"
    >
      <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet to-aura text-background shadow-[0_10px_30px_-12px_hsl(var(--violet)/0.9)] transition group-hover:scale-105">
        <PawPrint className="h-5 w-5" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-lg tracking-[0.18em] text-foreground">PURRE</span>
          <span className={cn("block text-[10px] uppercase tracking-[0.42em] text-muted-foreground")}>
            pets
          </span>
        </span>
      )}
    </button>
  );
}
