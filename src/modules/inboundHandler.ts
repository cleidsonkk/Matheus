import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { InboundMessage, ValidationJob } from "../types.js";
import { buildExtractionFailureMessage, buildTelegramWelcomeMessage } from "./messageBuilder.js";
import { sendText } from "./notifier.js";
import { createValidationJob, hasDatabase, recordExtractionFailure } from "./persistence.js";
import { extractTicketCode } from "./ticketExtractor.js";

export type InboundHandleResult =
  | { kind: "ignored"; reason: string }
  | { kind: "no_code" }
  | { kind: "queued"; job: ValidationJob; duplicate: boolean };

export async function prepareInboundForProcessing(inbound: InboundMessage): Promise<InboundHandleResult> {
  if (inbound.mensagem.length > config.maxMessageLength) {
    return { kind: "ignored", reason: "mensagem_muito_longa" };
  }

  const extraction = extractTicketCode(inbound.mensagem);

  if (!extraction.codigo_encontrado || !extraction.codigo) {
    if (inbound.channel === "telegram" && /^\/(?:start|help)(?:@\w+)?(?:\s|$)/i.test(inbound.mensagem.trim())) {
      await sendText(inbound.channel, inbound.recipientId, buildTelegramWelcomeMessage());
      return { kind: "ignored", reason: "telegram_command" };
    }

    await sendText(inbound.channel, inbound.recipientId, buildExtractionFailureMessage());
    await recordExtractionFailure({
      channel: inbound.channel,
      recipientId: inbound.recipientId,
      mensagem: inbound.mensagem,
      externalMessageId: inbound.externalMessageId,
      raw: inbound.raw
    });

    return { kind: "no_code" };
  }

  if (!hasDatabase()) {
    const job: ValidationJob = {
      id: randomUUID(),
      externalMessageId: inbound.externalMessageId,
      channel: inbound.channel,
      recipientId: inbound.recipientId,
      numero: inbound.recipientId,
      mensagem: inbound.mensagem,
      codigo: extraction.codigo,
      raw: inbound.raw,
      createdAt: new Date().toISOString()
    };

    return { kind: "queued", job, duplicate: false };
  }

  const created = await createValidationJob({
    channel: inbound.channel,
    recipientId: inbound.recipientId,
    mensagem: inbound.mensagem,
    codigo: extraction.codigo,
    externalMessageId: inbound.externalMessageId,
    raw: inbound.raw
  });

  return { kind: "queued", ...created };
}
