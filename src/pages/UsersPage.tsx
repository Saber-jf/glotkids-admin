/**
 * KULLANICILAR (2026-10-22): everyone with an account.
 *
 *   Ebeveynler    every Supabase account (the app's parents, and the admins,
 *                 marked): how they sign in, when they joined and were last
 *                 seen, the child's progress kept for them; ban, unban,
 *                 forget the progress, delete the account
 *   Yöneticiler   who may open this panel (one role): add by e-mail, remove
 *   İşlem kaydı   every change to an account or to the admins, by whom
 *
 * Without accounts on the server (no Supabase project yet) the list of
 * accounts says how to set them up; the admins list can be written already.
 */
import React from "react";
import { Ban, CheckCircle2, ScrollText, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { addAdmin, ApiError, banAccount, codeOf, deleteAccount, deleteAccountProgress, getAccount, getMe, listAccounts, listAdmins, listAudit,
         removeAdmin, type Account, type Admin, type AuditEntry, type Me } from "../api";
import { EmptyState, FormField, Loading, Modal, ModalActions, Notice, PageHeader, Pill, fmtSize } from "../components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const when = (t: number | null | undefined) => (t ? new Date(t).toLocaleString("tr", { dateStyle: "medium", timeStyle: "short" }) : "—");
const PROVIDER: Record<string, string> = { email: "E-posta kodu", google: "Google", apple: "Apple" };
const ACTION: Record<string, string> = {
  "admin.add": "yönetici ekledi", "admin.remove": "yöneticilerden çıkardı", "admin.rebind": "hesabı yeniden bağlandı",
  "account.ban": "hesabı engelledi", "account.unban": "engeli kaldırdı", "account.delete": "hesabı sildi", "progress.delete": "ilerleme yedeğini sildi",
};

export function UsersPage() {
  const [me, setMe] = React.useState<Me | null>(null);
  React.useEffect(() => { getMe().then(setMe, () => {}); }, []);
  return (
    <>
      <PageHeader title="Kullanıcılar"
        sub="Uygulamadaki ebeveyn hesapları, paneli açabilen yöneticiler ve hesaplarda yapılan her değişikliğin kaydı. Hesaplar Supabase'tedir; çocuk için ad ya da doğum tarihi tutulmaz, yalnız cihazın ilerleme belgesi yedeklenir." />
      <Tabs defaultValue="accounts">
        <TabsList className="mb-5">
          <TabsTrigger value="accounts"><Users />Hesaplar</TabsTrigger>
          <TabsTrigger value="admins"><ShieldCheck />Yöneticiler</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText />İşlem kaydı</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts"><Accounts me={me} /></TabsContent>
        <TabsContent value="admins"><AdminsTab me={me} /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </>
  );
}

/* ── accounts ─────────────────────────────────────────────────────────────── */

const PER = 50;

function Accounts({ me }: { me: Me | null }) {
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ users: Account[]; total: number | null } | null>(null);
  const [error, setError] = React.useState<{ text: string; off?: boolean } | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "delete" | "progress"; user: Account } | null>(null);
  const load = React.useCallback(() => {
    listAccounts(page, PER, query).then((d) => { setData(d); setError(null); },
      (e) => setError({ text: (e as Error).message, off: codeOf(e) === "ACCOUNTS_OFF" }));
  }, [page, query]);
  React.useEffect(() => { load(); }, [load]);
  /* the search waits for typing to stop */
  React.useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const act = async (f: () => Promise<unknown>) => {
    try { await f(); load(); } catch (e) { alert((e as Error).message); }
  };

  if (error?.off) return <AccountsOff />;
  const pages = data?.total ? Math.max(1, Math.ceil(data.total / PER)) : null;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="E-posta ya da hesap kimliği ara" value={q} onChange={(e) => setQ(e.target.value)} data-testid="users-search" />
        </div>
        {data?.total !== null && data && <span className="text-sm text-muted-foreground">{data.total} hesap</span>}
      </div>
      {error && <Notice tone="bad" className="mb-4">{error.text}</Notice>}
      {!data ? <Loading /> : data.users.length === 0
        ? <EmptyState icon={<Users />} title={query ? "Bulunamadı" : "Henüz hesap yok"}
                      sub={query ? "Bu aramaya uyan bir hesap yok." : "Bir ebeveyn uygulamada hesap açınca burada görünür."} />
        : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-posta</TableHead><TableHead>Giriş</TableHead><TableHead>Kayıt</TableHead><TableHead>Son giriş</TableHead>
                  <TableHead>İlerleme yedeği</TableHead><TableHead>Durum</TableHead><TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => {
                  const self = me?.email === u.email;
                  const p = u.backup?.summary.profiles ?? [];
                  return (
                    <TableRow key={u.id} data-testid={`user-${u.email}`}>
                      <TableCell className="font-medium">
                        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setOpen(u.id)}>{u.email || u.id}</button>
                        {u.admin && <Pill tone="accent" className="ml-2">yönetici</Pill>}
                      </TableCell>
                      <TableCell>{PROVIDER[u.provider] ?? u.provider}</TableCell>
                      <TableCell>{when(u.createdAt)}</TableCell>
                      <TableCell>{when(u.lastSignInAt)}</TableCell>
                      <TableCell>{u.backup
                        ? <span title={`${fmtSize(u.backup.bytes)} · ${u.backup.device || "cihaz?"}`}>
                            {p.length} çocuk · {Math.max(0, ...p.map((x) => x.stops))} durak · {Math.max(0, ...p.map((x) => x.words))} kelime
                            <span className="block text-xs text-muted-foreground">{when(u.backup.updatedAt)}</span></span>
                        : <span className="text-muted-foreground">yok</span>}</TableCell>
                      <TableCell>{u.bannedUntil ? <Pill tone="bad">engelli</Pill> : <Pill tone="ok">etkin</Pill>}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!self && (u.bannedUntil
                          ? <Button size="sm" variant="outline" onClick={() => act(() => banAccount(u.id, false))} data-testid={`unban-${u.email}`}><CheckCircle2 />Engeli kaldır</Button>
                          : <Button size="sm" variant="outline" onClick={() => act(() => banAccount(u.id, true))} data-testid={`ban-${u.email}`}><Ban />Engelle</Button>)}
                        {u.backup && <Button size="sm" variant="ghost" className="ml-1" onClick={() => setConfirm({ kind: "progress", user: u })}>Yedeği sil</Button>}
                        {!self && !u.admin && <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={() => setConfirm({ kind: "delete", user: u })}
                                                      data-testid={`delete-${u.email}`}><Trash2 />Sil</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      {pages && pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</Button>
          <span>{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sonraki</Button>
        </div>
      )}
      {open && <AccountDetail id={open} onClose={() => setOpen(null)} />}
      {confirm && <ConfirmAccount {...confirm} onClose={() => setConfirm(null)}
        onDone={async () => {
          const u = confirm.user;
          await act(() => (confirm.kind === "delete" ? deleteAccount(u.id) : deleteAccountProgress(u.id)));
          setConfirm(null);
        }} />}
    </>
  );
}

/** deleting is for ever: the e-mail is typed to confirm it */
function ConfirmAccount({ kind, user, onClose, onDone }: { kind: "delete" | "progress"; user: Account; onClose: () => void; onDone: () => Promise<void> }) {
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const del = kind === "delete";
  return (
    <Modal title={del ? "Hesap silinsin mi?" : "İlerleme yedeği silinsin mi?"} onClose={onClose}
      description={del
        ? "Hesap Supabase'ten ve bu sunucudan kalıcı olarak silinir; ilerleme yedeği de gider. Ebeveynin cihazındaki ilerleme kalır. Geri alınamaz."
        : "Sunucudaki yedek silinir; hesap ve ebeveynin cihazındaki ilerleme kalır. Cihaz bir sonraki açılışta yeniden yedekler."}>
      {del && <FormField label={`Onaylamak için e-postayı yazın: ${user.email}`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="confirm-email" />
      </FormField>}
      <ModalActions>
        <Button variant="outline" onClick={onClose}>Vazgeç</Button>
        <Button variant="destructive" disabled={busy || (del && typed.trim().toLowerCase() !== user.email)} data-testid="confirm-go"
                onClick={async () => { setBusy(true); await onDone(); setBusy(false); }}>{del ? "Hesabı sil" : "Yedeği sil"}</Button>
      </ModalActions>
    </Modal>
  );
}

function AccountDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = React.useState<(Account & { events: AuditEntry[] }) | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => { getAccount(id).then(setD, (e) => setError((e as Error).message)); }, [id]);
  return (
    <Modal title={d?.email ?? "Hesap"} onClose={onClose} wide>
      {error ? <Notice tone="bad">{error}</Notice> : !d ? <Loading /> : (
        <div className="space-y-5 text-sm">
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Hesap kimliği</dt><dd className="font-mono text-xs">{d.id}</dd></div>
            <div><dt className="text-muted-foreground">Giriş yöntemi</dt><dd>{PROVIDER[d.provider] ?? d.provider}</dd></div>
            <div><dt className="text-muted-foreground">Kayıt</dt><dd>{when(d.createdAt)}</dd></div>
            <div><dt className="text-muted-foreground">Son giriş</dt><dd>{when(d.lastSignInAt)}</dd></div>
            <div><dt className="text-muted-foreground">Uygulamada son görülme</dt><dd>{when(d.lastSeenAt)}</dd></div>
            <div><dt className="text-muted-foreground">Durum</dt><dd>{d.bannedUntil ? "engelli" : "etkin"}{d.admin ? " · yönetici" : ""}</dd></div>
          </dl>
          <div>
            <h3 className="mb-2 font-medium">İlerleme yedeği</h3>
            {!d.backup ? <p className="text-muted-foreground">Yedek yok.</p> : (<>
              <p className="mb-2 text-muted-foreground">Sürüm {d.backup.rev} · {fmtSize(d.backup.bytes)} · {d.backup.device || "cihaz bilinmiyor"} · {when(d.backup.updatedAt)}</p>
              <Table>
                <TableHeader><TableRow><TableHead>Çocuk</TableHead><TableHead>Biten durak</TableHead><TableHead>Tanışılan kelime</TableHead><TableHead>Biten seri</TableHead><TableHead>Haritada</TableHead></TableRow></TableHeader>
                <TableBody>{d.backup.summary.profiles.map((p, i) => (
                  <TableRow key={i}><TableCell>{p.label}</TableCell><TableCell>{p.stops}</TableCell><TableCell>{p.words}</TableCell><TableCell>{p.series}</TableCell><TableCell>{p.at ?? "—"}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </>)}
          </div>
          <div>
            <h3 className="mb-2 font-medium">İşlem kaydı</h3>
            {d.events.length === 0 ? <p className="text-muted-foreground">Kayıt yok.</p>
              : <ul className="space-y-1">{d.events.map((e) => <li key={e.id}>{when(e.at)} · <b className="font-medium">{e.actor}</b> {ACTION[e.action] ?? e.action}</li>)}</ul>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AccountsOff() {
  return (
    <Notice tone="warn">
      <b className="font-medium">Hesaplar henüz kurulmadı.</b> Sunucunun <code>.env</code> dosyasına Supabase projesinin
      <code> SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code> ve <code>SUPABASE_SERVICE_ROLE_KEY</code> değerleri ile
      ilk yöneticinin e-postası (<code>ADMIN_EMAILS</code>) yazılıp sunucu yeniden başlatılınca hesaplar burada listelenir ve panel
      e-postayla girişe geçer. Ayrıntı: sunucunun README'si, "Hesaplar". Yöneticiler listesi şimdiden düzenlenebilir.
    </Notice>
  );
}

/* ── admins ───────────────────────────────────────────────────────────────── */

function AdminsTab({ me }: { me: Me | null }) {
  const [list, setList] = React.useState<Admin[] | null>(null);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const load = React.useCallback(() => { listAdmins().then(setList, (e) => setNote({ tone: "bad", text: (e as Error).message })); }, []);
  React.useEffect(() => { load(); }, [load]);
  const add = async () => {
    try {
      const r = await addAdmin(email.trim(), name.trim());
      setNote({ tone: "ok", text: r.account === "later"
        ? `${r.email} eklendi. Hesaplar kurulunca bu e-postayla giriş yapabilecek.`
        : `${r.email} eklendi. Panel adresine gidip e-postasına gelen kodla giriş yapabilir.` });
      setEmail(""); setName(""); load();
    } catch (e) { setNote({ tone: "bad", text: (e as Error).message }); }
  };
  const remove = async (a: Admin) => {
    if (!confirm(`${a.email} yöneticilerden çıkarılsın mı? Paneli artık açamaz; hesabı silinmez.`)) return;
    try { await removeAdmin(a.email); load(); } catch (e) { setNote({ tone: "bad", text: (e as Error).message }); }
  };
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-4">
        <FormField label="E-posta" className="min-w-64 flex-1"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" /></FormField>
        <FormField label="Ad (isteğe bağlı)" className="min-w-48"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
        <Button disabled={!emailOk} onClick={add} data-testid="admin-add"><UserPlus />Yönetici ekle</Button>
      </div>
      {note && <Notice tone={note.tone === "ok" ? "ok" : "bad"}>{note.text}</Notice>}
      {!list ? <Loading /> : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>E-posta</TableHead><TableHead>Ad</TableHead><TableHead>Ekleyen</TableHead><TableHead>Eklendi</TableHead><TableHead>Son giriş</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{list.map((a) => (
              <TableRow key={a.email} data-testid={`admin-${a.email}`}>
                <TableCell className="font-medium">{a.email}{me?.email === a.email && <Pill className="ml-2">siz</Pill>}{a.seeded && <Pill tone="accent" className="ml-2" title="Sunucunun ADMIN_EMAILS ayarında">sunucu ayarı</Pill>}</TableCell>
                <TableCell>{a.name || "—"}</TableCell>
                <TableCell>{a.addedBy || "—"}</TableCell>
                <TableCell>{when(a.createdAt)}</TableCell>
                <TableCell>{a.lastLoginAt ? when(a.lastLoginAt) : <span className="text-muted-foreground">henüz girmedi</span>}</TableCell>
                <TableCell className="text-right">{me?.email !== a.email && !a.seeded &&
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)} data-testid={`admin-remove-${a.email}`}><Trash2 />Çıkar</Button>}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Panelde tek rol var: her yönetici her şeyi yapabilir (içerik, yayın, kullanıcılar). Sunucunun
        <code> ADMIN_EMAILS</code> ayarındaki e-postalar her açılışta geri eklenir; onları buradan çıkarmak için önce o ayardan çıkarın.</p>
    </div>
  );
}

/* ── audit ────────────────────────────────────────────────────────────────── */

function AuditTab() {
  const [list, setList] = React.useState<AuditEntry[] | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => { listAudit().then(setList, (e) => setError(e instanceof ApiError ? e.message : String(e))); }, []);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!list) return <Loading />;
  if (!list.length) return <EmptyState icon={<ScrollText />} title="Kayıt yok" sub="Bir hesapta ya da yöneticilerde değişiklik olunca burada görünür." />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow><TableHead>Zaman</TableHead><TableHead>Kim</TableHead><TableHead>Ne yaptı</TableHead><TableHead>Kime</TableHead><TableHead>Not</TableHead></TableRow></TableHeader>
        <TableBody>{list.map((e) => (
          <TableRow key={e.id} data-testid="audit-row">
            <TableCell className="whitespace-nowrap">{when(e.at)}</TableCell><TableCell>{e.actor}</TableCell>
            <TableCell>{ACTION[e.action] ?? e.action}</TableCell><TableCell className="font-mono text-xs">{e.target}</TableCell>
            <TableCell className="text-muted-foreground">{e.detail}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}
