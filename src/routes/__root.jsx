import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import { Toaster } from "@/components/ui/sonner";
import MediaUrlFix from "@/components/common/MediaUrlFix";
import { RodoBanner } from "@/components/common/RodoBanner";
import { AuthProvider } from "@/lib/AuthContext";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import appCss from "@/index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0a0a0f" },
      { property: "og:site_name", content: "PURRE PETS" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://purrepets.pl" },
      { property: "og:title", content: "PURRE PETS — premium social marketplace dla hodowców" },
      { property: "og:description", content: "PurreFeed, Reels, PURRE Messenger i marketplace dla hodowców psów i kotów rasowych." },
      { property: "og:locale", content: "pl_PL" },
      { title: "PURRE PETS — premium social marketplace dla hodowców" },
      {
        name: "description",
        content:
          "PURRE PETS — elegancki social marketplace dla hodowców psów i kotów rasowych: PurreFeed, marketplace z lokalizacją, PURRE Messenger, adopcje, Smart Match i PURRE Arcade.",
      },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap",
      },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  return (
    <AuthProvider>
      <I18nProvider>
        <ThemeProvider>
          <Outlet />
          <MediaUrlFix />
          <RodoBanner />
          <Toaster />
        </ThemeProvider>
      </I18nProvider>
    </AuthProvider>
  );
}

function RootDocument({ children }) {
  return (
    <html lang="pl" data-theme="aura">
      <head>
        <HeadContent />
      </head>
      <body data-react-root="true">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
