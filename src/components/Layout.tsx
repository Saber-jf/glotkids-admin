import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, BookA, Clapperboard, Drama, Music, CheckCircle2, CloudOff, FolderTree, Gamepad2, Images, LayoutDashboard, Library, LogOut, Map as MapIcon, Package,
         Mic, Monitor, Moon, Palette, SwatchBook, Receipt, RefreshCw, Rocket, Smartphone, Sun, Type, UserRound, Users } from "lucide-react";
import { useStore } from "../store";
import { getMascots, getMe, setToken, type Me } from "../api";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
         DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
         SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Loading, Notice, Pill } from "./common";
import { dropOrphan, flushEdits, useOrphanEdits } from "@/lib/autosave";

const GROUPS = [
  { label: "İçerik", items: [
    { to: "/", label: "Genel bakış", icon: LayoutDashboard, end: true },
    { to: "/kategoriler", label: "Kategoriler", icon: FolderTree },
    { to: "/yol-haritasi", label: "Yol haritası", icon: MapIcon },
    { to: "/paketler", label: "İndirme paketleri", icon: Package },
    { to: "/maskotlar", label: "Maskotlar", icon: Drama },
    { to: "/muzik", label: "Müzik", icon: Music },
    { to: "/sarki-videolari", label: "Şarkı videoları", icon: Clapperboard },
    { to: "/yazi-tipi", label: "Yazı tipi", icon: Type },
    { to: "/renk-paleti", label: "Renk paleti", icon: SwatchBook },
    { to: "/oyunlar", label: "Oyunlar", icon: Gamepad2 },
    { to: "/kelime-setleri", label: "Kelime setleri", icon: BookA },
    { to: "/kelimeler", label: "Kelime kütüphanesi", icon: Library },
  ] },
  { label: "Stüdyolar", items: [
    { to: "/ses-studyosu", label: "Ses stüdyosu", icon: Mic },
    { to: "/gorsel-studyosu", label: "Görsel stüdyosu", icon: Palette },
    { to: "/medya", label: "Medya kütüphanesi", icon: Images },
    { to: "/uretim-isleri", label: "Üretim işleri", icon: Receipt },
  ] },
  { label: "Yayın", items: [
    { to: "/yayinla", label: "Yayınla", icon: Rocket },
    { to: "/uygulama", label: "Uygulama", icon: Smartphone },
  ] },
  { label: "Hesaplar", items: [
    { to: "/kullanicilar", label: "Kullanıcılar", icon: Users },
  ] },
];
const NAV = GROUPS.flatMap((g) => g.items);

/* ── light / dark ───────────────────────────────────────────────────────── */

type Theme = "light" | "dark" | "system";
const THEME_KEY = "loplop-admin-theme";
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = React.useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system"; } catch { return "system"; }
  });
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private window */ }
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return [theme, setTheme];
}

function ThemeMenu() {
  const [theme, setTheme] = useTheme();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Görünüm"><Icon /><span className="sr-only">Görünüm</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light"><Sun /> Açık</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon /> Koyu</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> Sistem</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** who the panel is open for, and the way out */
function UserMenu() {
  const [me, setMe] = React.useState<Me | null>(null);
  React.useEffect(() => { getMe().then(setMe, () => {}); }, []);
  if (!me || me.via === "open") return null;
  const out = async () => {
    if (me.via === "account") await signOut(); else setToken("");
    window.location.assign("/");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5" data-testid="user-menu"><UserRound />
          <span className="hidden max-w-48 truncate sm:inline">{me.via === "account" ? me.email : "Panel anahtarı"}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">{me.via === "account" ? <>Giriş: <b className="font-medium">{me.email}</b></> : "Panel anahtarıyla açık"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void out(); }} data-testid="sign-out"><LogOut />Çıkış yap</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── the studio document and the server ─────────────────────────────────── */

/** where the document stands with the server */
function SyncBadge() {
  const { sync } = useStore();
  const s = {
    loading: { icon: <Spinner className="size-3" />, text: "Sunucudan okunuyor", tone: "plain" as const },
    saving: { icon: <Spinner className="size-3" />, text: "Kaydediliyor…", tone: "plain" as const },
    saved: { icon: <CheckCircle2 />, text: "Stüdyo belgesi kaydedildi", tone: "ok" as const },
    offline: { icon: <CloudOff />, text: "Sunucuya ulaşılamıyor", tone: "bad" as const },
    conflict: { icon: <AlertTriangle />, text: "Başka yerde değişti", tone: "warn" as const },
  }[sync];
  /* UX02: this is the studio document's state (voices, fixed lines, takes,
     images, workshop) -- every other editor shows its own beside its form */
  return <Pill tone={s.tone} className="h-6 gap-1.5 px-2.5"
               title="Ses ve görsel stüdyosunun belgesi (sesler, sabit satırlar, kayıtlar, görseller). Kategori, harita, paket, şarkı ve maskot sayfaları kendi kayıt durumunu formun yanında gösterir.">
    {s.icon}{s.text}</Pill>;
}

/** edits of pages that closed with their save failing: never silently dropped */
function OrphanBanner() {
  const list = useOrphanEdits();
  const [busy, setBusy] = React.useState(false);
  if (!list.length) return null;
  return (
    <Notice tone="bad" icon={<CloudOff />} className="mb-6"
      action={<Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await flushEdits(); setBusy(false); }}>
        {busy && <Spinner data-icon="inline-start" />}Tekrar dene</Button>}>
      <b className="font-medium">Kapanan bir sayfadaki düzenleme kaydedilemedi</b>; bu pencerede bekliyor, Yayınla da onu bekler.
      <ul className="mt-1 space-y-0.5">
        {list.map((x, i) => (
          <li key={i} className="text-sm">
            {x.label}: <span className="opacity-80">{x.message}</span>{" "}
            <button type="button" className="underline underline-offset-2"
                    onClick={() => { if (confirm(`"${x.label}" değişikliğinden vazgeçilsin mi? Sunucudaki hâli kalır.`)) dropOrphan(x.key); }}>vazgeç</button>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/** work this browser kept that the server never got (A06): offered, never applied on its own */
function RecoveryBanner() {
  const { recovery, restoreLocal, discardLocal } = useStore();
  if (!recovery) return null;
  const moved = recovery.baseRev !== recovery.serverRev;
  return (
    <Notice tone="accent" icon={<AlertTriangle />} className="mb-6"
      action={<>
        <Button variant="outline" size="sm" onClick={discardLocal}>At</Button>
        <Button size="sm" onClick={() => { if (!moved || confirm("Sunucudaki daha yeni belgenin üstüne yazılsın mı?")) restoreLocal(); }}>Geri yükle</Button>
      </>}>
      Bu tarayıcıda sunucuya ulaşmamış stüdyo değişiklikleri bulundu ({new Date(recovery.at).toLocaleString("tr")}).
      {moved ? ` Sunucudaki belge o zamandan beri değişti (rev ${recovery.baseRev} → ${recovery.serverRev}); geri yüklemek sunucudakinin üstüne yazar.` : ""}
    </Notice>
  );
}

/** what to do when the server is gone or another window saved first */
function SyncBanner() {
  const { sync, syncError, reloadFromServer, loaded } = useStore();
  if (sync !== "offline" && sync !== "conflict") return null;
  return (
    <Notice tone={sync === "offline" ? "bad" : "warn"} icon={sync === "offline" ? <CloudOff /> : <AlertTriangle />} className="mb-6"
      action={
        <Button variant="outline" size="sm" onClick={() => {
          if (sync === "conflict" && !confirm("Sunucudaki sürüm yüklensin mi? Bu penceredeki kaydedilmemiş değişiklikler gider.")) return;
          reloadFromServer();
        }}><RefreshCw />{sync === "offline" ? "Yeniden bağlan" : "Sunucudakini yükle"}</Button>
      }>
      {sync === "offline"
        ? <>Sunucuya ulaşılamıyor: <code>loplop-server</code> klasöründe <code>npm run dev</code> çalışıyor mu? {loaded
            ? "Değişiklikleriniz bu pencerede (ve bu tarayıcıda) duruyor; sunucu dönünce kendiliğinden kaydedilecek."
            : "İçerik sunucudan okunamadı."} <span className="opacity-70">({syncError})</span></>
        : <>İçerik başka bir pencerede kaydedildi. Bu penceredeki kaydedilmemiş değişiklikler sunucudakinin üstüne yazılmadı.</>}
    </Notice>
  );
}

/* ── the frame ──────────────────────────────────────────────────────────── */

function AppSidebar() {
  const { setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="GlotKids">
              <Link to="/" onClick={() => setOpenMobile(false)}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">🐰</div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">GlotKids</span>
                  <span className="truncate text-xs text-muted-foreground">İçerik yönetimi</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Ana menü">
          {GROUPS.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map(({ to, label, icon: Icon, end }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild tooltip={label}
                        isActive={end ? pathname === to : pathname === to || pathname.startsWith(to + "/")}>
                        <NavLink to={to} end={end} onClick={() => setOpenMobile(false)}><Icon /><span>{label}</span></NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-xs text-muted-foreground">Değişiklikler taslaktır; telefonlara <b className="font-medium text-foreground">Yayınla</b> sayfasından gider.</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Crumbs() {
  const { pathname } = useLocation();
  const here = NAV.filter((n) => n.to !== "/").find((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
  const nested = !!here && pathname !== here.to;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          {here ? <BreadcrumbLink asChild><Link to="/">GlotKids</Link></BreadcrumbLink> : <BreadcrumbPage>Genel bakış</BreadcrumbPage>}
        </BreadcrumbItem>
        {here && <>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            {nested ? <BreadcrumbLink asChild><Link to={here.to}>{here.label}</Link></BreadcrumbLink> : <BreadcrumbPage>{here.label}</BreadcrumbPage>}
          </BreadcrumbItem>
          {nested && <><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Düzenle</BreadcrumbPage></BreadcrumbItem></>}
        </>}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function Layout() {
  const { sync, loaded } = useStore();
  /* the studio names its speakers after the mascots in play (Maskotlar) */
  const [, named] = React.useState(0);
  React.useEffect(() => { getMascots().then(() => named((n) => n + 1), () => {}); }, []);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70">
          <SidebarTrigger className="-ml-1" />
          <div aria-hidden className="mr-1 h-4 w-px shrink-0 bg-border" />
          <Crumbs />
          <div className="ml-auto flex items-center gap-1.5">
            <SyncBadge />
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <SyncBanner />
          <RecoveryBanner />
          <OrphanBanner />
          {/* nothing is edited before the server's document has arrived */}
          {sync === "loading"
            ? <Loading className="justify-center py-24">Sunucudan okunuyor…</Loading>
            : loaded ? <Outlet /> : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
