"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Acc,
  Msg,
  MsgFull,
  createAccount,
  deleteAccount,
  deleteMessage,
  getDomains,
  getMessage,
  listMessages,
  relogin,
} from "@/lib/mailtm";

const KEY = "tempmail.accounts.v2";
const PRESETS = [1, 5, 10, 20];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const I = {
  copy: "M9 9h10v10H9zM5 15V5h10",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  back: "M15 5l-7 7 7 7",
  down: "M12 4v12M7 11l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export default function Page() {
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<MsgFull | null>(null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [toast, setToast] = useState("");
  const inboxRef = useRef<HTMLElement>(null);
  const accountsRef = useRef<Acc[]>([]);
  accountsRef.current = accounts;

  const active = useMemo(() => accounts.find((a) => a.id === activeId) ?? null, [accounts, activeId]);

  const say = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const run = useCallback(async <T,>(a: Acc, fn: (token: string) => Promise<T>): Promise<T> => {
    try {
      return await fn(a.token);
    } catch (e) {
      if ((e as Error).message === "401") {
        const token = await relogin(a);
        setAccounts((p) => p.map((x) => (x.id === a.id ? { ...x, token } : x)));
        return fn(token);
      }
      throw e;
    }
  }, []);

  const generate = useCallback(async (n: number) => {
    setBusy(true);
    setProgress({ done: 0, total: n });
    let made = 0;
    try {
      const domains = await getDomains();
      for (let i = 0; i < n; i++) {
        let a: Acc | null = null;
        for (let t = 0; t < 2 && !a; t++) {
          try {
            a = await createAccount(domains);
          } catch {
            await sleep(1500);
          }
        }
        if (a) {
          made++;
          const acc = a;
          setAccounts((p) => [acc, ...p]);
          setActiveId(acc.id);
        }
        setProgress({ done: i + 1, total: n });
        await sleep(700);
      }
      say(made === n ? `${made} alamat siap dipakai` : `${made} dari ${n} alamat berhasil dibuat`);
    } catch {
      say("Gagal terhubung. Coba lagi sebentar.");
    }
    setBusy(false);
    setProgress(null);
  }, [say]);

  useEffect(() => {
    try {
      const saved: Acc[] = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (saved.length) {
        setAccounts(saved);
        setActiveId(saved[0].id);
      } else {
        generate(1);
      }
    } catch {
      generate(1);
    }
    setReady(true);
  }, [generate]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(accounts));
    } catch {}
  }, [accounts, ready]);

  const loadActive = useCallback(async () => {
    if (!active) {
      setMsgs([]);
      return;
    }
    setLoadingMsgs(true);
    try {
      const m = await run(active, (t) => listMessages(t));
      setMsgs(m);
      setCounts((c) => ({ ...c, [active.id]: m.filter((x) => !x.seen).length }));
    } catch {}
    setLoadingMsgs(false);
  }, [active, run]);

  useEffect(() => {
    setOpen(null);
    setMsgs([]);
    loadActive();
    const id = setInterval(() => {
      if (!document.hidden) loadActive();
    }, 8000);
    return () => clearInterval(id);
  }, [loadActive]);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      for (const a of accountsRef.current) {
        if (a.id === activeId) continue;
        try {
          const m = await run(a, (t) => listMessages(t));
          setCounts((c) => ({ ...c, [a.id]: m.filter((x) => !x.seen).length }));
        } catch {}
        await sleep(400);
      }
    }, 45000);
    return () => clearInterval(id);
  }, [activeId, run]);

  async function copy(text: string, label = "Tersalin") {
    try {
      await navigator.clipboard.writeText(text);
      say(label);
    } catch {
      say("Gagal menyalin");
    }
  }

  function pick(id: string) {
    setActiveId(id);
    setTimeout(() => inboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function openMsg(id: string) {
    if (!active) return;
    try {
      const m = await run(active, (t) => getMessage(t, id));
      setOpen(m);
      loadActive();
    } catch {
      say("Gagal membuka pesan");
    }
  }

  async function removeMsg() {
    if (!active || !open) return;
    try {
      await run(active, (t) => deleteMessage(t, open.id));
    } catch {}
    setOpen(null);
    loadActive();
  }

  async function removeAcc(a: Acc) {
    try {
      await run(a, (t) => deleteAccount(t, a.id));
    } catch {}
    const rest = accounts.filter((x) => x.id !== a.id);
    setAccounts(rest);
    if (activeId === a.id) setActiveId(rest[0]?.id ?? null);
  }

  async function removeAll() {
    if (!accounts.length || !confirm(`Hapus ${accounts.length} alamat beserta semua pesannya?`)) return;
    const all = accounts;
    setAccounts([]);
    setActiveId(null);
    setCounts({});
    for (const a of all) {
      try {
        await deleteAccount(a.token, a.id);
      } catch {}
      await sleep(300);
    }
  }

  function exportTxt() {
    const body = accounts.map((a) => `${a.address}:${a.password}`).join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "temp-mail.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const codes = useMemo(() => {
    if (!open) return [];
    const found = (open.text || "").match(/\b\d{4,8}\b/g) || [];
    return Array.from(new Set(found)).slice(0, 3);
  }, [open]);

  const srcDoc = open
    ? `<base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#18181b;word-break:break-word;margin:16px}img{max-width:100%;height:auto}</style>${
        open.html?.[0] || `<pre style="white-space:pre-wrap;font:inherit">${(open.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`
      }`
    : "";

  const card = "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
  const ghost =
    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white">
            <Icon d={I.mail} className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Temp Mail</span>
        </div>
        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {accounts.length} alamat aktif
        </span>
      </header>

      <section className="pb-8 pt-4 sm:pt-8">
        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Email sementara, sebanyak yang kamu butuhkan.
        </h1>
        <p className="mt-4 max-w-xl text-zinc-600 dark:text-zinc-400">
          Buat satu atau puluhan alamat sekaligus, terima kode verifikasi, lalu buang. Inbox asli tetap bersih.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div className={`${card} p-5`}>
            <p className="text-sm font-semibold">Buat alamat baru</p>
            <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Jumlah alamat">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={count === n}
                  onClick={() => setCount(n)}
                  className={`h-11 rounded-xl border text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    count === n
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-zinc-200 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => generate(count)}
              disabled={busy}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <Icon d={I.plus} />
              {busy ? "Membuat alamat…" : `Buat ${count} alamat`}
            </button>
            {progress && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div className="h-full bg-teal-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {progress.done} dari {progress.total} selesai
                </p>
              </div>
            )}
          </div>

          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold">Alamatmu</p>
              <div className="flex">
                <button onClick={() => copy(accounts.map((a) => a.address).join("\n"), "Semua alamat tersalin")} className={ghost} disabled={!accounts.length}>
                  <Icon d={I.copy} /> Salin semua
                </button>
                <button onClick={exportTxt} className={ghost} disabled={!accounts.length} aria-label="Unduh daftar">
                  <Icon d={I.down} />
                </button>
                <button onClick={removeAll} className={ghost} disabled={!accounts.length} aria-label="Hapus semua">
                  <Icon d={I.trash} />
                </button>
              </div>
            </div>
            <ul className="scroll-thin max-h-[420px] overflow-y-auto">
              {accounts.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-zinc-500">Belum ada alamat. Buat dulu dengan tombol di atas.</li>
              )}
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-center gap-1 border-b border-zinc-100 px-2 last:border-0 dark:border-zinc-800/70 ${
                    a.id === activeId ? "bg-teal-50 dark:bg-teal-950/40" : ""
                  }`}
                >
                  <button onClick={() => pick(a.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left">
                    <span className="truncate font-mono text-[13px]">{a.address}</span>
                    {!!counts[a.id] && (
                      <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{counts[a.id]}</span>
                    )}
                  </button>
                  <button onClick={() => copy(a.address)} className={ghost} aria-label="Salin alamat">
                    <Icon d={I.copy} />
                  </button>
                  <button onClick={() => removeAcc(a)} className={ghost} aria-label="Hapus alamat">
                    <Icon d={I.trash} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section ref={inboxRef} className={`${card} flex min-h-[460px] scroll-mt-4 flex-col overflow-hidden`}>
          {!active ? (
            <div className="m-auto px-6 py-16 text-center text-zinc-500">
              <Icon d={I.mail} className="mx-auto mb-3 h-8 w-8" />
              <p className="text-sm">Pilih atau buat alamat untuk melihat inbox.</p>
            </div>
          ) : open ? (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                <button onClick={() => setOpen(null)} className={ghost}>
                  <Icon d={I.back} /> Inbox
                </button>
                <button onClick={removeMsg} className={ghost}>
                  <Icon d={I.trash} /> Hapus
                </button>
              </div>
              <div className="px-5 pt-5">
                <h2 className="text-xl font-bold leading-snug">{open.subject || "(tanpa subjek)"}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {open.from.name ? `${open.from.name} · ` : ""}
                  {open.from.address} · {timeAgo(open.createdAt)}
                </p>
                {codes.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-zinc-500">Kode terdeteksi:</span>
                    {codes.map((c) => (
                      <button
                        key={c}
                        onClick={() => copy(c, "Kode tersalin")}
                        className="rounded-lg border border-teal-700/30 bg-teal-50 px-3 py-1.5 font-mono text-sm font-semibold text-teal-800 hover:bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <iframe title="Isi pesan" sandbox="" srcDoc={srcDoc} className="m-5 min-h-[360px] flex-1 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">Inbox untuk</p>
                  <p className="truncate font-mono text-sm font-semibold">{active.address}</p>
                </div>
                <div className="flex shrink-0">
                  <button onClick={() => copy(active.address)} className={ghost}>
                    <Icon d={I.copy} /> Salin
                  </button>
                  <button onClick={loadActive} className={ghost} aria-label="Muat ulang">
                    <Icon d={I.refresh} className={`h-4 w-4 ${loadingMsgs ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              {msgs.length === 0 ? (
                <div className="m-auto px-6 py-16 text-center">
                  <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                    <Icon d={I.mail} className="h-6 w-6" />
                  </span>
                  <p className="font-semibold">Menunggu pesan pertama</p>
                  <p className="mt-1 text-sm text-zinc-500">Gunakan alamat ini untuk mendaftar. Pesan masuk muncul otomatis.</p>
                </div>
              ) : (
                <ul className="scroll-thin overflow-y-auto">
                  {msgs.map((m) => (
                    <li key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/70">
                      <button onClick={() => openMsg(m.id)} className="flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-teal-600"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className={`truncate text-sm ${m.seen ? "font-medium" : "font-bold"}`}>{m.from.name || m.from.address}</span>
                            <span className="shrink-0 text-xs text-zinc-500">{timeAgo(m.createdAt)}</span>
                          </span>
                          <span className="block truncate text-sm">{m.subject || "(tanpa subjek)"}</span>
                          <span className="block truncate text-sm text-zinc-500">{m.intro}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <p className="mt-8 max-w-xl text-xs text-zinc-500">
        Siapa pun yang tahu sebuah alamat bisa membuka inboxnya. Jangan dipakai untuk akun penting seperti bank atau media sosial utama.
      </p>

      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 flex justify-center transition ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        <span className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">{toast}</span>
      </div>
    </div>
  );
}
