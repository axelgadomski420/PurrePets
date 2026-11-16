import { useState } from "react";
import { Palette, Check, Globe } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { THEMES, useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function ThemeLangMenu({ align = "end" }) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition hover:text-foreground"
          aria-label={t("common.theme")}
        >
          <Palette className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 rounded-2xl border-border/70 bg-popover/95 p-3 backdrop-blur-xl">
        <p className="px-2 pb-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t("common.theme")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2 py-2 text-left transition",
                theme === item.id
                  ? "border-violet/70 bg-violet/10"
                  : "border-border/60 hover:border-foreground/25"
              )}
            >
              <span className="flex flex-col overflow-hidden rounded-md">
                {item.swatch.map((color) => (
                  <span key={color} className="h-2 w-4" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold">{item.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{item.hint}</span>
              </span>
              {theme === item.id && <Check className="ml-auto h-3.5 w-3.5 text-aura" />}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {["pl", "en"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest transition",
                lang === code ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {code}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
