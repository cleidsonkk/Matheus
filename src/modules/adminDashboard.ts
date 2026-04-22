import { neon } from "@neondatabase/serverless";
import { config } from "../config.js";

type RawRow = Record<string, any>;

type AdminGame = {
  date: string;
  sport: string;
  home: string;
  away: string;
  market: string;
  selection: string;
  odd: number | null;
  status: string;
  result: string;
};

export type AdminTicket = {
  id: string;
  createdAt: string;
  processedAt: string | null;
  channel: string;
  contact: string;
  customerName: string;
  username: string | null;
  siteCustomerName: string | null;
  ticketCode: string | null;
  siteTicketCode: string | null;
  status: string;
  siteStatus: string | null;
  confirmed: boolean;
  confirmationCode: string | null;
  amount: number;
  prize: number;
  gameCount: number;
  games: AdminGame[];
  customerMessage: string | null;
  errorMessage: string | null;
  textSent: boolean;
  imageSent: boolean;
  deliveryError: string | null;
};

export type AdminCustomerSummary = {
  key: string;
  customerName: string;
  contact: string;
  channel: string;
  tickets: number;
  confirmed: number;
  amount: number;
  prize: number;
  lastActivity: string;
};

export type AdminDashboardData = {
  generatedAt: string;
  filters: {
    q: string;
    status: string;
    limit: number;
  };
  totals: {
    tickets: number;
    confirmed: number;
    pendingOrOpen: number;
    amount: number;
    prize: number;
    games: number;
  };
  customers: AdminCustomerSummary[];
  tickets: AdminTicket[];
};

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function numberFrom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function nullableString(value: unknown): string | null {
  const text = pickString(value);
  return text || null;
}

function formatResult(item: RawRow): string {
  const directResult = pickString(item.resultado, item.result);

  if (directResult) {
    return directResult;
  }

  const homeScore = item.placar_c;
  const awayScore = item.placar_f;

  if (homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined) {
    return `${homeScore} x ${awayScore}`;
  }

  return "";
}

function customerFromRaw(raw: RawRow, siteCustomerName: string | null): { name: string; username: string | null } {
  const message = raw?.message ?? raw?.edited_message ?? raw?.channel_post ?? {};
  const telegramUser = message.from ?? message.chat ?? {};
  const telegramName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ").trim();
  const username = nullableString(telegramUser.username);

  const whatsappName = pickString(
    raw?.pushName,
    raw?.senderName,
    raw?.name,
    raw?.data?.pushName,
    raw?.data?.senderName,
    raw?.data?.name,
    raw?.data?.key?.pushName
  );

  return {
    name: telegramName || whatsappName || siteCustomerName || "Cliente sem nome",
    username
  };
}

function extractGames(payload: RawRow): AdminGame[] {
  const items = Array.isArray(payload?.itens)
    ? payload.itens
    : Array.isArray(payload?.itensBolao)
      ? payload.itensBolao
      : [];

  return items.map((item: RawRow) => ({
    date: pickString(item.dt_jogo, item.data, item.date),
    sport: pickString(item.esporte_nome, item.esporte, item.esporte_id),
    home: pickString(item.casa_nome, item.time_casa, item.home, item.casa),
    away: pickString(item.visit_nome, item.time_visitante, item.away, item.visitante),
    market: pickString(item.odd_desc, item.mercado, item.market),
    selection: pickString(item.descricao, item.palpite, item.selection),
    odd: numberFrom(item.taxa || item.odd || item.cotacao) || null,
    status: pickString(item.sit_desc, item.status_desc, item.status),
    result: formatResult(item)
  }));
}

function normalizeTicket(row: RawRow): AdminTicket {
  const resultPayload = row.result_payload ?? {};
  const ticketPayload = resultPayload.dados_bilhete ?? {};
  const aposta = ticketPayload.aposta ?? {};
  const siteCustomerName = nullableString(aposta.cliente);
  const customer = customerFromRaw(row.raw_payload ?? {}, siteCustomerName);
  const games = extractGames(ticketPayload);
  const amount = numberFrom(aposta.vl_aposta ?? aposta.valor ?? aposta.amount);
  const prize = numberFrom(aposta.vl_premio ?? aposta.premio ?? aposta.prize);

  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    channel: row.channel,
    contact: row.phone,
    customerName: customer.name,
    username: customer.username,
    siteCustomerName,
    ticketCode: nullableString(row.ticket_code),
    siteTicketCode: nullableString(aposta.codigo),
    status: row.status,
    siteStatus: nullableString(aposta.status_desc),
    confirmed: Boolean(row.confirmed),
    confirmationCode: nullableString(row.confirmation_code),
    amount,
    prize,
    gameCount: games.length,
    games,
    customerMessage: nullableString(row.customer_message),
    errorMessage: nullableString(row.error_message),
    textSent: Boolean(row.text_sent),
    imageSent: Boolean(row.image_sent),
    deliveryError: nullableString(row.delivery_error)
  };
}

function groupCustomers(tickets: AdminTicket[]): AdminCustomerSummary[] {
  const groups = new Map<string, AdminCustomerSummary>();

  for (const ticket of tickets) {
    const key = `${ticket.channel}:${ticket.contact}`;
    const current = groups.get(key) ?? {
      key,
      customerName: ticket.customerName,
      contact: ticket.contact,
      channel: ticket.channel,
      tickets: 0,
      confirmed: 0,
      amount: 0,
      prize: 0,
      lastActivity: ticket.createdAt
    };

    current.tickets += 1;
    current.confirmed += ticket.confirmed ? 1 : 0;
    current.amount += ticket.amount;
    current.prize += ticket.prize;

    if (new Date(ticket.createdAt).getTime() > new Date(current.lastActivity).getTime()) {
      current.lastActivity = ticket.createdAt;
      current.customerName = ticket.customerName;
    }

    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
}

export async function loadAdminDashboardData(input: {
  q?: string;
  status?: string;
  limit?: number;
}): Promise<AdminDashboardData> {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL nao configurada");
  }

  const q = input.q?.trim() ?? "";
  const status = input.status?.trim() ?? "";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const filters: string[] = [];
  const params: unknown[] = [];

  if (status && status !== "todos") {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const index = params.length;
    filters.push(`(
      lower(coalesce(phone, '')) like $${index}
      or lower(coalesce(ticket_code, '')) like $${index}
      or lower(coalesce(result_payload->'dados_bilhete'->'aposta'->>'cliente', '')) like $${index}
      or lower(coalesce(result_payload->'dados_bilhete'->'aposta'->>'codigo', '')) like $${index}
      or lower(coalesce(raw_payload->'message'->'from'->>'first_name', '')) like $${index}
      or lower(coalesce(raw_payload->'message'->'from'->>'last_name', '')) like $${index}
      or lower(coalesce(raw_payload->'message'->'from'->>'username', '')) like $${index}
    )`);
  }

  params.push(limit);
  const query = `
    SELECT
      id,
      external_message_id,
      channel,
      phone,
      original_message,
      ticket_code,
      status,
      confirmed,
      confirmation_code,
      customer_message,
      error_message,
      text_sent,
      image_sent,
      delivery_error,
      raw_payload,
      result_payload,
      created_at,
      processed_at
    FROM validation_jobs
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const rows = await neon(config.databaseUrl).query(query, params);
  const tickets = rows.map(normalizeTicket);

  return {
    generatedAt: new Date().toISOString(),
    filters: { q, status: status || "todos", limit },
    tickets,
    customers: groupCustomers(tickets),
    totals: {
      tickets: tickets.length,
      confirmed: tickets.filter((ticket) => ticket.confirmed).length,
      pendingOrOpen: tickets.filter((ticket) => !ticket.confirmed).length,
      amount: tickets.reduce((total, ticket) => total + ticket.amount, 0),
      prize: tickets.reduce((total, ticket) => total + ticket.prize, 0),
      games: tickets.reduce((total, ticket) => total + ticket.gameCount, 0)
    }
  };
}
