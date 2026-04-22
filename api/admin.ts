import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../src/config.js";
import { type AdminDashboardData, type AdminTicket, loadAdminDashboardData } from "../src/modules/adminDashboard.js";

function safeEquals(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function parseBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");

  if (separator === -1) {
    return null;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1)
  };
}

function isAuthorized(req: any): boolean {
  if (!config.admin.username || !config.admin.password) {
    return false;
  }

  const credentials = parseBasicAuth(req.headers.authorization);
  return Boolean(
    credentials
      && safeEquals(credentials.username, config.admin.username)
      && safeEquals(credentials.password, config.admin.password)
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}

function statusClass(status: string, confirmed: boolean): string {
  if (confirmed || status === "confirmado") {
    return "ok";
  }

  if (status === "erro" || status === "codigo_nao_encontrado") {
    return "bad";
  }

  return "warn";
}

function metric(label: string, value: string): string {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCustomerRows(data: AdminDashboardData): string {
  if (data.customers.length === 0) {
    return `<tr><td colspan="8" class="empty">Nenhum cliente encontrado.</td></tr>`;
  }

  return data.customers.map((customer) => `
    <tr>
      <td>${escapeHtml(customer.customerName)}</td>
      <td>${escapeHtml(customer.contact)}</td>
      <td>${escapeHtml(customer.channel)}</td>
      <td class="num">${customer.tickets}</td>
      <td class="num">${customer.confirmed}</td>
      <td class="num">${formatMoney(customer.amount)}</td>
      <td class="num">${formatMoney(customer.prize)}</td>
      <td>${formatDate(customer.lastActivity)}</td>
    </tr>
  `).join("");
}

function renderGames(ticket: AdminTicket): string {
  if (ticket.games.length === 0) {
    return `<p class="muted">Sem jogos detalhados gravados para este registro.</p>`;
  }

  return `
    <table class="inner">
      <thead>
        <tr>
          <th>Data</th>
          <th>Jogo</th>
          <th>Mercado</th>
          <th>Palpite</th>
          <th>Odd</th>
          <th>Status</th>
          <th>Resultado</th>
        </tr>
      </thead>
      <tbody>
        ${ticket.games.map((game) => `
          <tr>
            <td>${escapeHtml(game.date ? formatDate(game.date) : "-")}</td>
            <td>
              <strong>${escapeHtml(game.home || "-")}</strong>
              <span class="muted"> x </span>
              <strong>${escapeHtml(game.away || "-")}</strong>
              ${game.sport ? `<small>${escapeHtml(game.sport)}</small>` : ""}
            </td>
            <td>${escapeHtml(game.market || "-")}</td>
            <td>${escapeHtml(game.selection || "-")}</td>
            <td class="num">${game.odd ? escapeHtml(game.odd.toFixed(2)) : "-"}</td>
            <td>${escapeHtml(game.status || "-")}</td>
            <td>${escapeHtml(game.result || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTicketRows(data: AdminDashboardData): string {
  if (data.tickets.length === 0) {
    return `<tr><td colspan="9" class="empty">Nenhum bilhete encontrado.</td></tr>`;
  }

  return data.tickets.map((ticket) => `
    <tr>
      <td>
        <strong>${escapeHtml(ticket.customerName)}</strong>
        ${ticket.username ? `<small>@${escapeHtml(ticket.username)}</small>` : ""}
        ${ticket.siteCustomerName ? `<small>Site: ${escapeHtml(ticket.siteCustomerName)}</small>` : ""}
      </td>
      <td>
        ${escapeHtml(ticket.contact)}
        <small>${escapeHtml(ticket.channel)}</small>
      </td>
      <td>
        <strong>${escapeHtml(ticket.ticketCode ?? "-")}</strong>
        ${ticket.siteTicketCode && ticket.siteTicketCode !== ticket.ticketCode ? `<small>Site: ${escapeHtml(ticket.siteTicketCode)}</small>` : ""}
      </td>
      <td>
        <span class="pill ${statusClass(ticket.status, ticket.confirmed)}">${escapeHtml(ticket.status)}</span>
        ${ticket.siteStatus ? `<small>${escapeHtml(ticket.siteStatus)}</small>` : ""}
      </td>
      <td class="num">${formatMoney(ticket.amount)}</td>
      <td class="num">${formatMoney(ticket.prize)}</td>
      <td class="num">${ticket.gameCount}</td>
      <td>${formatDate(ticket.createdAt)}</td>
      <td>
        <details>
          <summary>Ver jogos</summary>
          ${renderGames(ticket)}
          <dl>
            <dt>Confirmação</dt>
            <dd>${escapeHtml(ticket.confirmationCode ?? "-")}</dd>
            <dt>Mensagem enviada</dt>
            <dd>${escapeHtml(ticket.customerMessage ?? "-")}</dd>
            <dt>Entrega</dt>
            <dd>Texto: ${ticket.textSent ? "sim" : "não"} | Imagem: ${ticket.imageSent ? "sim" : "não"}</dd>
            ${ticket.errorMessage ? `<dt>Erro</dt><dd>${escapeHtml(ticket.errorMessage)}</dd>` : ""}
            ${ticket.deliveryError ? `<dt>Erro de entrega</dt><dd>${escapeHtml(ticket.deliveryError)}</dd>` : ""}
          </dl>
        </details>
      </td>
    </tr>
  `).join("");
}

function renderHtml(data: AdminDashboardData): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin - Validador de Bilhetes</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --text: #171a1f;
      --muted: #69707d;
      --line: #dfe3e8;
      --surface: #ffffff;
      --accent: #0f766e;
      --bad: #b42318;
      --warn: #a15c07;
      --ok-bg: #dcfce7;
      --bad-bg: #fee4e2;
      --warn-bg: #fef3c7;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.4 Arial, Helvetica, sans-serif;
    }
    header, main { width: min(1440px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 24px 0 12px; display: flex; justify-content: space-between; gap: 16px; align-items: end; }
    h1 { font-size: 24px; margin: 0; }
    h2 { font-size: 16px; margin: 28px 0 10px; }
    form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    input, select, button {
      height: 36px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
    }
    button { background: var(--accent); color: white; border-color: var(--accent); cursor: pointer; }
    .metrics { display: grid; grid-template-columns: repeat(6, minmax(130px, 1fr)); gap: 10px; }
    .metric { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .metric span, small, .muted { color: var(--muted); }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--line); background: var(--surface); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 980px; }
    th, td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: #eef1f4; font-size: 12px; text-transform: uppercase; color: #4b5563; }
    td small { display: block; margin-top: 2px; }
    .num { text-align: right; white-space: nowrap; }
    .pill { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; }
    .pill.ok { background: var(--ok-bg); color: #166534; }
    .pill.bad { background: var(--bad-bg); color: var(--bad); }
    .pill.warn { background: var(--warn-bg); color: var(--warn); }
    details summary { cursor: pointer; color: var(--accent); font-weight: 700; }
    .inner { min-width: 760px; margin: 10px 0; font-size: 13px; border: 1px solid var(--line); }
    dl { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; margin: 10px 0 0; }
    dt { color: var(--muted); }
    dd { margin: 0; white-space: pre-wrap; }
    .empty { text-align: center; color: var(--muted); padding: 24px; }
    @media (max-width: 900px) {
      header { align-items: stretch; flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      input, select, button { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Admin - Validador de Bilhetes</h1>
      <div class="muted">Atualizado em ${formatDate(data.generatedAt)}</div>
    </div>
    <form method="get" action="/api/admin">
      <input name="q" value="${escapeHtml(data.filters.q)}" placeholder="Cliente, contato ou bilhete">
      <select name="status">
        ${["todos", "confirmado", "encontrado", "nao_encontrado", "erro", "queued", "processing"].map((status) => `
          <option value="${status}" ${data.filters.status === status ? "selected" : ""}>${status}</option>
        `).join("")}
      </select>
      <select name="limit">
        ${[50, 100, 200, 500].map((limit) => `
          <option value="${limit}" ${data.filters.limit === limit ? "selected" : ""}>${limit}</option>
        `).join("")}
      </select>
      <button type="submit">Filtrar</button>
    </form>
  </header>
  <main>
    <section class="metrics">
      ${metric("Bilhetes", String(data.totals.tickets))}
      ${metric("Confirmados", String(data.totals.confirmed))}
      ${metric("Em aberto/pendentes", String(data.totals.pendingOrOpen))}
      ${metric("Jogos", String(data.totals.games))}
      ${metric("Valor apostado", formatMoney(data.totals.amount))}
      ${metric("Prêmio possível", formatMoney(data.totals.prize))}
    </section>

    <section>
      <h2>Resumo por cliente</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contato</th>
              <th>Canal</th>
              <th>Qtd.</th>
              <th>Confirmados</th>
              <th>Valor</th>
              <th>Prêmio</th>
              <th>Último envio</th>
            </tr>
          </thead>
          <tbody>${renderCustomerRows(data)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Bilhetes e jogos</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contato</th>
              <th>Bilhete</th>
              <th>Status</th>
              <th>Valor</th>
              <th>Prêmio</th>
              <th>Jogos</th>
              <th>Recebido</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>${renderTicketRows(data)}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (!config.admin.username || !config.admin.password) {
    res.status(503).send("ADMIN_USERNAME e ADMIN_PASSWORD precisam estar configurados.");
    return;
  }

  if (!isAuthorized(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Validador Admin", charset="UTF-8"');
    res.status(401).send("Autenticacao obrigatoria.");
    return;
  }

  const data = await loadAdminDashboardData({
    q: typeof req.query.q === "string" ? req.query.q : "",
    status: typeof req.query.status === "string" ? req.query.status : "todos",
    limit: typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 100
  });

  if (req.query.format === "json") {
    res.status(200).json(data);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderHtml(data));
}
