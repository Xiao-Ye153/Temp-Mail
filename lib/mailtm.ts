const API = "https://api.mail.tm";

export type Acc = { id: string; address: string; password: string; token: string; createdAt: number };
export type Msg = {
  id: string;
  from: { address: string; name: string };
  subject: string;
  intro: string;
  createdAt: string;
  seen: boolean;
};
export type MsgFull = Msg & { text: string; html: string[] };

async function call<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(String(res.status));
  if (res.status === 204) return null as T;
  return res.json();
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const rnd = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => ALPHABET[x % ALPHABET.length]).join("");

export async function getDomains(): Promise<string[]> {
  const d = await call<{ "hydra:member": { domain: string }[] }>("/domains");
  return d["hydra:member"].map((x) => x.domain);
}

export async function createAccount(domains: string[]): Promise<Acc> {
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const address = `${rnd(10)}@${domain}`;
  const password = rnd(18);
  const a = await call<{ id: string }>("/accounts", undefined, {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  const t = await call<{ token: string }>("/token", undefined, {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  return { id: a.id, address, password, token: t.token, createdAt: Date.now() };
}

export async function relogin(a: Acc): Promise<string> {
  const t = await call<{ token: string }>("/token", undefined, {
    method: "POST",
    body: JSON.stringify({ address: a.address, password: a.password }),
  });
  return t.token;
}

export async function listMessages(token: string): Promise<Msg[]> {
  const d = await call<{ "hydra:member": Msg[] }>("/messages", token);
  return d["hydra:member"];
}

export const getMessage = (token: string, id: string) => call<MsgFull>(`/messages/${id}`, token);
export const deleteMessage = (token: string, id: string) => call<null>(`/messages/${id}`, token, { method: "DELETE" });
export const deleteAccount = (token: string, id: string) => call<null>(`/accounts/${id}`, token, { method: "DELETE" });
