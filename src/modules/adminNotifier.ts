import { config } from "../config.js";
import { log } from "../logger.js";
import type { InboundMessage, TicketConfirmationResult, ValidationJob } from "../types.js";
import { extractTicketFinancials, formatMoney, getCustomerCreditSummary, type CustomerCreditSummary } from "./credit.js";
import { customerIdentityFromInbound, formatPhoneNumber, getCustomerProfile } from "./customerProfile.js";
import { TelegramClient } from "./telegram.js";

const telegram = new TelegramClient();

function adminChatIds(): string[] {
  return Array.from(new Set(config.adminNotifications.telegramChatIds));
}

function hasAdminTargets(): boolean {
  return adminChatIds().length > 0;
}

function statusHeading(result: TicketConfirmationResult): string {
  if (result.confirmado) {
    return "✅ Bilhete confirmado";
  }

  if (result.status === "limite_excedido") {
    return "🚫 Limite excedido";
  }

  if (result.status === "encontrado") {
    return "⚠️ Bilhete localizado sem confirmação";
  }

  if (result.status === "nao_encontrado") {
    return "⚠️ Bilhete não localizado";
  }

  return "🔴 Falha na validação";
}

function creditLines(credit: CustomerCreditSummary | null): string[] {
  if (!credit) {
    return [];
  }

  const lines = [
    `Limite: ${formatMoney(credit.limit)}`,
    `Em aberto: ${formatMoney(credit.outstanding)}`,
    `Disponível: ${formatMoney(credit.available)}`,
    `Pago: ${formatMoney(credit.payments)}`
  ];

  if (credit.limit && credit.available !== null) {
    const availablePercent = credit.limit > 0 ? (credit.available / credit.limit) * 100 : 0;

    if (availablePercent <= config.adminNotifications.lowCreditPercent) {
      lines.push(`Atenção: cliente com limite quase atingido (${availablePercent.toFixed(0)}% disponível).`);
    }

    if (credit.outstanding >= credit.limit) {
      lines.push("Atenção: cliente atingiu ou estourou o limite.");
    }
  }

  return lines;
}

async function sendAdminMessage(text: string): Promise<void> {
  const chatIds = adminChatIds();

  if (chatIds.length === 0) {
    return;
  }

  await Promise.all(chatIds.map((chatId) => telegram.sendText(chatId, text)));
}

export async function notifyAdminValidationResult(job: ValidationJob, result: TicketConfirmationResult): Promise<void> {
  if (!hasAdminTargets()) {
    return;
  }

  const profile = await getCustomerProfile(job.channel, job.recipientId).catch(() => null);
  const financials = extractTicketFinancials(result.dados_bilhete);
  const credit = result.credit ?? await getCustomerCreditSummary(job.channel, job.recipientId).catch(() => null);
  const phoneNumber = formatPhoneNumber(profile?.phoneNumber ?? null);
  const customerName = profile?.displayName ?? "Cliente sem nome";
  const username = profile?.username ? `@${profile.username}` : null;

  const lines = [
    statusHeading(result),
    `Cliente: ${customerName}`,
    `Canal: ${job.channel}`,
    `ID Telegram/contato: ${job.recipientId}`
  ];

  if (phoneNumber) {
    lines.push(`Celular: ${phoneNumber}`);
  }

  if (username) {
    lines.push(`Usuário: ${username}`);
  }

  lines.push(
    `Código: ${job.codigo}`,
    `Valor: ${formatMoney(financials.amount)}`,
    `Jogos: ${financials.gameCount}`,
    `Prêmio possível: ${formatMoney(financials.prize)}`
  );

  if (result.codigo_confirmacao) {
    lines.push(`Confirmação: ${result.codigo_confirmacao}`);
  }

  if (result.mensagem_erro) {
    lines.push(`Ocorrência: ${result.mensagem_erro}`);
  }

  lines.push(...creditLines(credit));

  await sendAdminMessage(lines.join("\n"));
}

export async function notifyAdminExtractionFailure(inbound: InboundMessage, reason: "codigo_invalido" | "multiplos_codigos"): Promise<void> {
  if (!hasAdminTargets()) {
    return;
  }

  const identity = customerIdentityFromInbound(inbound);
  const profile = await getCustomerProfile(inbound.channel, inbound.recipientId).catch(() => null);
  const title = reason === "multiplos_codigos"
    ? "⚠️ Cliente enviou mais de um código"
    : "⚠️ Código não identificado";
  const lines = [
    title,
    `Cliente: ${profile?.displayName ?? identity.displayName ?? "Cliente sem nome"}`,
    `Canal: ${inbound.channel}`,
    `ID Telegram/contato: ${inbound.recipientId}`
  ];

  const phoneNumber = formatPhoneNumber(profile?.phoneNumber ?? inbound.contactPhone ?? null);

  if (phoneNumber) {
    lines.push(`Celular: ${phoneNumber}`);
  }

  lines.push(`Mensagem: ${inbound.mensagem.slice(0, 300)}`);
  await sendAdminMessage(lines.join("\n"));
}

export function notifyAdminSafely(promise: Promise<void>, context: Record<string, unknown>): void {
  promise.catch((error) => {
    log("warn", "Falha ao notificar administrador", {
      ...context,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}
