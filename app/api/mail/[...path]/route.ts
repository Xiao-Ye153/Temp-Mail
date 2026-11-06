import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const url = `https://api.mail.tm/${params.path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const hasBody = req.method !== "GET" && req.method !== "DELETE";

  try {
    const res = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    const body = res.status === 204 ? null : await res.text();
    return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "upstream" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}

export { handler as GET, handler as POST, handler as DELETE };
