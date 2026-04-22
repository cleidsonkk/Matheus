import { config } from "../src/config.js";
import { isAdminRequestAuthorized } from "../src/modules/adminAuth.js";
import {
  type AdminBreakdown,
  type AdminCustomerSummary,
  type AdminDashboardData,
  type AdminTicket,
  loadAdminDashboardData
} from "../src/modules/adminDashboard.js";

const STATUSES = [
  "todos",
  "confirmado",
  "encontrado",
  "nao_encontrado",
  "codigo_nao_encontrado",
  "erro",
  "queued",
  "processing"
] as const;

const CHANNELS = ["todos", "telegram", "whatsapp"] as const;

function queryStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
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

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function formatDateOnly(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function formatOdd(value: number | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmado: "Confirmado",
    encontrado: "Localizado",
    nao_encontrado: "Não encontrado",
    codigo_nao_encontrado: "Código não identificado",
    erro: "Erro",
    queued: "Na fila",
    processing: "Processando",
    todos: "Todos"
  };

  return labels[status] ?? status;
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    todos: "Todos"
  };

  return labels[channel] ?? channel;
}

function statusClass(status: string, confirmed = false): string {
  if (confirmed || status === "confirmado") {
    return "ok";
  }

  if (status === "erro" || status === "nao_encontrado" || status === "codigo_nao_encontrado") {
    return "bad";
  }

  if (status === "processing" || status === "queued") {
    return "info";
  }

  return "warn";
}

function buildAdminUrl(data: AdminDashboardData, extra: Record<string, string>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries({
    q: data.filters.q,
    status: data.filters.status,
    channel: data.filters.channel,
    from: data.filters.from,
    to: data.filters.to,
    limit: String(data.filters.limit),
    ...extra
  })) {
    if (value && value !== "todos") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return `/api/admin${query ? `?${query}` : ""}`;
}

function metric(label: string, value: string, detail: string): string {
  return `
    <section class="metric" aria-label="${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </section>
  `;
}

function renderBreakdown(title: string, items: AdminBreakdown[], formatter: (label: string) => string): string {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return `
    <section class="panel compact">
      <div class="section-heading">
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="breakdown">
        ${items.length === 0 ? `<p class="empty-text">Sem dados no filtro atual.</p>` : items.map((item) => {
          const width = total > 0 ? Math.max(6, Math.round((item.count / total) * 100)) : 0;

          return `
            <div class="breakdown-row">
              <div>
                <strong>${escapeHtml(formatter(item.label))}</strong>
                <small>${formatMoney(item.amount)} em apostas</small>
              </div>
              <span>${formatInteger(item.count)}</span>
              <div class="bar"><i style="width:${width}%"></i></div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderCustomerRows(customers: AdminCustomerSummary[]): string {
  if (customers.length === 0) {
    return `<tr><td colspan="9" class="empty">Nenhum cliente encontrado.</td></tr>`;
  }

  return customers.map((customer) => `
    <tr>
      <td data-label="Cliente"><strong>${escapeHtml(customer.customerName)}</strong></td>
      <td data-label="Contato">${escapeHtml(customer.contact)}</td>
      <td data-label="Canal">${escapeHtml(channelLabel(customer.channel))}</td>
      <td data-label="Bilhetes" class="num">${formatInteger(customer.tickets)}</td>
      <td data-label="Confirmados" class="num">${formatInteger(customer.confirmed)}</td>
      <td data-label="Jogos" class="num">${formatInteger(customer.games)}</td>
      <td data-label="Valor" class="num">${formatMoney(customer.amount)}</td>
      <td data-label="Prêmio" class="num">${formatMoney(customer.prize)}</td>
      <td data-label="Último envio">
        ${formatDate(customer.lastActivity)}
        ${customer.lastTicketCode ? `<small>${escapeHtml(customer.lastTicketCode)}</small>` : ""}
      </td>
    </tr>
  `).join("");
}

function renderGameCards(ticket: AdminTicket): string {
  if (ticket.games.length === 0) {
    return `<p class="empty-text">Sem jogos detalhados gravados para este bilhete.</p>`;
  }

  return `
    <div class="games">
      ${ticket.games.map((game, index) => `
        <article class="game">
          <div class="game-top">
            <span>Jogo ${index + 1}</span>
            <strong>${escapeHtml(formatOdd(game.odd))}</strong>
          </div>
          <div class="match">
            <strong>${escapeHtml(game.home || "-")}</strong>
            <span>x</span>
            <strong>${escapeHtml(game.away || "-")}</strong>
          </div>
          <dl class="game-fields">
            <div><dt>Data</dt><dd>${escapeHtml(game.date ? formatDate(game.date) : "-")}</dd></div>
            <div><dt>Esporte</dt><dd>${escapeHtml(game.sport || "-")}</dd></div>
            <div><dt>Mercado</dt><dd>${escapeHtml(game.market || "-")}</dd></div>
            <div><dt>Palpite</dt><dd>${escapeHtml(game.selection || "-")}</dd></div>
            <div><dt>Status</dt><dd>${escapeHtml(game.status || "-")}</dd></div>
            <div><dt>Resultado</dt><dd>${escapeHtml(game.result || "-")}</dd></div>
          </dl>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTicketCard(ticket: AdminTicket): string {
  const deliveryText = [
    ticket.textSent ? "texto enviado" : "texto pendente",
    ticket.imageSent ? "imagem enviada" : "sem imagem"
  ].join(" · ");

  return `
    <article class="ticket">
      <div class="ticket-head">
        <div>
          <span class="code">${escapeHtml(ticket.ticketCode ?? ticket.siteTicketCode ?? "-")}</span>
          <h3>${escapeHtml(ticket.customerName)}</h3>
          <p>
            ${escapeHtml(channelLabel(ticket.channel))} · ${escapeHtml(ticket.contact)}
            ${ticket.username ? ` · @${escapeHtml(ticket.username)}` : ""}
          </p>
        </div>
        <span class="pill ${statusClass(ticket.status, ticket.confirmed)}">${escapeHtml(statusLabel(ticket.status))}</span>
      </div>

      <dl class="ticket-grid">
        <div><dt>Recebido</dt><dd>${formatDate(ticket.createdAt)}</dd></div>
        <div><dt>Processado</dt><dd>${formatDate(ticket.processedAt)}</dd></div>
        <div><dt>Cliente no site</dt><dd>${escapeHtml(ticket.siteCustomerName ?? "-")}</dd></div>
        <div><dt>Status no site</dt><dd>${escapeHtml(ticket.siteStatus ?? "-")}</dd></div>
        <div><dt>Valor</dt><dd>${formatMoney(ticket.amount)}</dd></div>
        <div><dt>Prêmio possível</dt><dd>${formatMoney(ticket.prize)}</dd></div>
        <div><dt>Jogos</dt><dd>${formatInteger(ticket.gameCount)}</dd></div>
        <div><dt>Confirmação</dt><dd>${escapeHtml(ticket.confirmationCode ?? "-")}</dd></div>
      </dl>

      <details>
        <summary>Detalhes completos</summary>
        ${renderGameCards(ticket)}
        <dl class="message-grid">
          <div><dt>Mensagem recebida</dt><dd>${escapeHtml(ticket.originalMessage || "-")}</dd></div>
          <div><dt>Mensagem enviada</dt><dd>${escapeHtml(ticket.customerMessage ?? "-")}</dd></div>
          <div><dt>Entrega</dt><dd>${escapeHtml(deliveryText)}</dd></div>
          <div><dt>ID externo</dt><dd>${escapeHtml(ticket.externalMessageId ?? "-")}</dd></div>
          ${ticket.errorMessage ? `<div><dt>Erro</dt><dd>${escapeHtml(ticket.errorMessage)}</dd></div>` : ""}
          ${ticket.deliveryError ? `<div><dt>Erro de entrega</dt><dd>${escapeHtml(ticket.deliveryError)}</dd></div>` : ""}
        </dl>
      </details>
    </article>
  `;
}

function renderTickets(tickets: AdminTicket[]): string {
  if (tickets.length === 0) {
    return `<div class="empty-block">Nenhum bilhete encontrado para os filtros atuais.</div>`;
  }

  return tickets.map(renderTicketCard).join("");
}

function renderFilters(data: AdminDashboardData): string {
  return `
    <form method="get" action="/api/admin" class="filters">
      <label>
        <span>Busca</span>
        <input name="q" value="${escapeHtml(data.filters.q)}" placeholder="Cliente, contato ou bilhete" autocomplete="off">
      </label>
      <label>
        <span>Status</span>
        <select name="status">
          ${STATUSES.map((status) => `
            <option value="${status}" ${data.filters.status === status ? "selected" : ""}>${statusLabel(status)}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Canal</span>
        <select name="channel">
          ${CHANNELS.map((channel) => `
            <option value="${channel}" ${data.filters.channel === channel ? "selected" : ""}>${channelLabel(channel)}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>De</span>
        <input name="from" type="date" value="${escapeHtml(data.filters.from)}">
      </label>
      <label>
        <span>Até</span>
        <input name="to" type="date" value="${escapeHtml(data.filters.to)}">
      </label>
      <label>
        <span>Limite</span>
        <select name="limit">
          ${[50, 100, 200, 500].map((limit) => `
            <option value="${limit}" ${data.filters.limit === limit ? "selected" : ""}>${limit}</option>
          `).join("")}
        </select>
      </label>
      <button type="submit">Filtrar</button>
      <a class="button secondary" href="/api/admin">Limpar</a>
      <a class="button ghost" href="${escapeHtml(buildAdminUrl(data, { format: "json" }))}">Exportar JSON</a>
    </form>
  `;
}

function renderHtml(data: AdminDashboardData): string {
  const averageTicket = data.totals.tickets > 0 ? data.totals.amount / data.totals.tickets : 0;
  const lastUpdate = formatDate(data.generatedAt);
  const dataUrl = buildAdminUrl(data, { format: "json" });

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Admin - Validador de Bilhetes</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --surface: #ffffff;
      --surface-soft: #f9fafb;
      --text: #151923;
      --muted: #687385;
      --line: #d9dee7;
      --line-strong: #c5ccd8;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --ok: #137333;
      --ok-bg: #e7f6ec;
      --bad: #b42318;
      --bad-bg: #fde8e7;
      --warn: #945a00;
      --warn-bg: #fff3d6;
      --info: #155eef;
      --info-bg: #e8efff;
      --shadow: 0 1px 2px rgba(16, 24, 40, .06);
    }

    * { box-sizing: border-box; }
    html { min-width: 320px; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 Arial, Helvetica, sans-serif;
      letter-spacing: 0;
    }

    a { color: inherit; }
    .page {
      width: min(1480px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0 40px;
    }
    .topbar {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 16px;
    }
    .eyebrow {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; line-height: 1.15; }
    h2 { font-size: 16px; line-height: 1.25; }
    h3 { font-size: 16px; line-height: 1.25; margin-top: 4px; }
    .muted, small { color: var(--muted); }
    small { font-size: 12px; }

    .panel, .metric, .ticket {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .panel { padding: 14px; }
    .panel.compact { min-height: 100%; }
    .filters {
      display: grid;
      grid-template-columns: minmax(220px, 2fr) repeat(5, minmax(120px, 1fr)) auto auto auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 14px;
    }
    label span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    input, select, button, .button {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      letter-spacing: 0;
      padding: 8px 10px;
    }
    button, .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
    }
    button, .button.secondary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
      font-weight: 700;
    }
    .button.secondary { background: #334155; border-color: #334155; }
    .button.ghost { color: var(--accent-dark); background: #edf7f5; border-color: #b6ded8; font-weight: 700; }

    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric { padding: 13px; min-height: 92px; }
    .metric span { color: var(--muted); display: block; font-size: 12px; }
    .metric strong { display: block; font-size: 22px; line-height: 1.15; margin-top: 5px; }
    .metric small { display: block; margin-top: 6px; }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .breakdown { display: grid; gap: 10px; }
    .breakdown-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 12px;
      align-items: center;
    }
    .breakdown-row strong { display: block; }
    .breakdown-row span { font-weight: 700; }
    .bar {
      grid-column: 1 / -1;
      height: 7px;
      background: #edf0f4;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar i { display: block; height: 100%; background: var(--accent); border-radius: inherit; }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    table { width: 100%; min-width: 1060px; border-collapse: collapse; }
    th, td { padding: 11px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th {
      position: sticky;
      top: 0;
      background: #eef1f5;
      color: #475467;
      font-size: 12px;
      text-transform: uppercase;
      z-index: 1;
    }
    td strong { display: block; }
    td small { display: block; margin-top: 3px; }
    .num { text-align: right; white-space: nowrap; }
    .empty, .empty-block, .empty-text {
      color: var(--muted);
      text-align: center;
    }
    .empty-block {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 28px;
    }

    .tickets {
      display: grid;
      gap: 12px;
    }
    .ticket { padding: 14px; }
    .ticket-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .ticket-head p { color: var(--muted); margin-top: 4px; }
    .code {
      display: inline-block;
      color: var(--accent-dark);
      font-weight: 800;
      letter-spacing: .04em;
      word-break: break-word;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      min-height: 26px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .pill.ok { color: var(--ok); background: var(--ok-bg); }
    .pill.bad { color: var(--bad); background: var(--bad-bg); }
    .pill.warn { color: var(--warn); background: var(--warn-bg); }
    .pill.info { color: var(--info); background: var(--info-bg); }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      border: 1px solid #b6ded8;
      border-radius: 999px;
      background: #edf7f5;
      color: var(--accent-dark);
      font-weight: 800;
      padding: 6px 11px;
      white-space: nowrap;
    }
    .live::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(15, 118, 110, .12);
    }

    dl { margin: 0; }
    dt { color: var(--muted); font-size: 12px; margin-bottom: 2px; }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .ticket-grid, .game-fields, .message-grid {
      display: grid;
      gap: 10px;
    }
    .ticket-grid { grid-template-columns: repeat(4, minmax(150px, 1fr)); margin-bottom: 12px; }
    .ticket-grid > div, .message-grid > div {
      background: var(--surface-soft);
      border: 1px solid #edf0f4;
      border-radius: 6px;
      padding: 9px;
    }
    details {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }
    summary {
      color: var(--accent-dark);
      cursor: pointer;
      font-weight: 800;
      min-height: 30px;
    }
    .games {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
      margin: 10px 0 12px;
    }
    .game {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 11px;
      background: #ffffff;
    }
    .game-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .game-top strong { color: var(--text); font-size: 14px; }
    .match {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .match strong:last-child { text-align: right; }
    .match span { color: var(--muted); }
    .game-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .message-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    @media (max-width: 1180px) {
      .filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .metrics { grid-template-columns: repeat(3, minmax(150px, 1fr)); }
      .ticket-grid { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
    }
    @media (max-width: 760px) {
      .page { width: min(100% - 20px, 720px); padding-top: 16px; }
      .topbar { align-items: stretch; flex-direction: column; gap: 10px; }
      h1 { font-size: 22px; }
      .filters, .metrics, .split, .ticket-grid, .message-grid { grid-template-columns: 1fr; }
      .metric { min-height: auto; }
      .table-wrap { overflow: visible; border: 0; background: transparent; box-shadow: none; }
      table, thead, tbody, tr, th, td { display: block; width: 100%; min-width: 0; }
      thead { display: none; }
      tr {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--shadow);
        margin-bottom: 10px;
        overflow: hidden;
      }
      td {
        display: grid;
        grid-template-columns: minmax(110px, 38%) 1fr;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        text-align: left;
      }
      td::before {
        content: attr(data-label);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      td:last-child { border-bottom: 0; }
      .num { text-align: left; }
      .ticket-head { flex-direction: column; }
      .game-fields { grid-template-columns: 1fr; }
      .match { grid-template-columns: 1fr; }
      .match strong:last-child { text-align: left; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="topbar">
      <div>
        <span class="eyebrow">Painel administrativo</span>
        <h1>Validador de Bilhetes</h1>
        <p class="muted">Atualizado em <span id="last-update">${lastUpdate}</span></p>
      </div>
      <span class="live" id="live-status">Ao vivo</span>
    </header>

    ${renderFilters(data)}

    <section class="metrics" aria-label="Indicadores">
      ${metric("Bilhetes", formatInteger(data.totals.tickets), `${formatInteger(data.totals.customers)} cliente(s)`)}
      ${metric("Confirmados", formatInteger(data.totals.confirmed), `${formatInteger(data.totals.deliveredText)} resposta(s) enviada(s)`)}
      ${metric("Localizados", formatInteger(data.totals.found), `${formatInteger(data.totals.notFound)} não localizado(s)`)}
      ${metric("Valor apostado", formatMoney(data.totals.amount), `Média ${formatMoney(averageTicket)}`)}
      ${metric("Prêmio possível", formatMoney(data.totals.prize), `${formatInteger(data.totals.games)} jogo(s)`)}
      ${metric("Erros", formatInteger(data.totals.errors), `${formatInteger(data.totals.deliveredImage)} comprovante(s)`)}
    </section>

    <section class="split">
      ${renderBreakdown("Status dos bilhetes", data.statusBreakdown, statusLabel)}
      ${renderBreakdown("Canais de entrada", data.channelBreakdown, channelLabel)}
    </section>

    <section>
      <div class="section-heading">
        <h2>Resumo por cliente</h2>
        <span class="muted">${formatInteger(data.customers.length)} cliente(s)</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contato</th>
              <th>Canal</th>
              <th>Bilhetes</th>
              <th>Confirmados</th>
              <th>Jogos</th>
              <th>Valor</th>
              <th>Prêmio</th>
              <th>Último envio</th>
            </tr>
          </thead>
          <tbody>${renderCustomerRows(data.customers)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <div class="section-heading">
        <h2>Bilhetes e jogos</h2>
        <span class="muted">${formatInteger(data.tickets.length)} registro(s)</span>
      </div>
      <div class="tickets">${renderTickets(data.tickets)}</div>
    </section>
  </main>
  <script>
    (() => {
      const currentVersion = ${JSON.stringify(data.version)};
      const dataUrl = ${JSON.stringify(dataUrl)};
      const status = document.getElementById("live-status");
      const lastUpdate = document.getElementById("last-update");

      async function checkForUpdates() {
        try {
          const response = await fetch(dataUrl, {
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
          });

          if (!response.ok) {
            if (status) status.textContent = "Reconectando";
            return;
          }

          const data = await response.json();

          if (data.version !== currentVersion) {
            window.location.reload();
            return;
          }

          if (status) status.textContent = "Ao vivo";
          if (lastUpdate && data.generatedAt) {
            lastUpdate.textContent = new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo"
            }).format(new Date(data.generatedAt));
          }
        } catch {
          if (status) status.textContent = "Reconectando";
        }
      }

      window.setInterval(checkForUpdates, 8000);
    })();
  </script>
</body>
</html>`;
}

export default async function handler(req: any, res: any): Promise<void> {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (!config.admin.username || !config.admin.password) {
    res.status(503).send("ADMIN_USERNAME e ADMIN_PASSWORD precisam estar configurados.");
    return;
  }

  if (!isAdminRequestAuthorized(req.headers)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Validador Admin", charset="UTF-8"');
    res.status(401).send("Autenticação obrigatória.");
    return;
  }

  try {
    const data = await loadAdminDashboardData({
      q: queryStringValue(req.query.q),
      status: queryStringValue(req.query.status) || "todos",
      channel: queryStringValue(req.query.channel) || "todos",
      from: queryStringValue(req.query.from),
      to: queryStringValue(req.query.to),
      limit: Number.parseInt(queryStringValue(req.query.limit) || "100", 10)
    });

    if (queryStringValue(req.query.format) === "json") {
      res.status(200).json(data);
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderHtml(data));
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao carregar o painel administrativo.");
  }
}
