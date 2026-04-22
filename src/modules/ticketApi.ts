import { config } from "../config.js";

export type SiteTicketData = Record<string, any>;

type LookupResult =
  | { found: true; data: SiteTicketData; source: "aposta" | "bolao" }
  | { found: false; status: number | null; error: string | null };

function compactCode(codigo: string): string {
  return codigo.replace(/\s+/g, "").toUpperCase();
}

function authHeaders(codigo: string): Record<string, string> {
  return {
    AUTHTOKEN: config.targetSite.authToken,
    ID: config.targetSite.userId,
    COD: codigo,
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
    Referer: config.targetUrl
  };
}

async function requestTicket(path: string, codigo: string): Promise<{ status: number; data: unknown; text: string }> {
  const response = await fetch(`${config.targetSite.apiBaseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(codigo)
  });

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  return {
    status: response.status,
    data,
    text
  };
}

function isTicketData(data: unknown): data is SiteTicketData {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as Record<string, any>;
  return Boolean(payload.aposta?.codigo || payload.aposta?.apost_id);
}

export function hasTargetLogin(): boolean {
  return Boolean(config.targetSite.authToken && config.targetSite.userId !== "0");
}

export async function lookupTicket(codigo: string): Promise<LookupResult> {
  const variants = [codigo.toUpperCase(), compactCode(codigo)];
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (const variant of variants) {
    const aposta = await requestTicket("/api/Caixa/DetalheAposta/0", variant);
    lastStatus = aposta.status;
    lastError = aposta.text.slice(0, 500) || null;

    if (aposta.status === 200 && isTicketData(aposta.data)) {
      return { found: true, data: aposta.data, source: "aposta" };
    }

    if (aposta.status !== 404) {
      continue;
    }

    const bolao = await requestTicket("/api/CaixaBolao/DetalheAposta/0", variant);
    lastStatus = bolao.status;
    lastError = bolao.text.slice(0, 500) || null;

    if (bolao.status === 200 && isTicketData(bolao.data)) {
      return { found: true, data: bolao.data, source: "bolao" };
    }
  }

  return { found: false, status: lastStatus, error: lastError };
}
