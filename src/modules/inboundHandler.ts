import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { InboundWhatsAppMessage, ValidationJob } from "../types.js";
import { buildExtractionFailureMessage } from "./messageBuilder.js";
import { createValidationJob, hasDatabase, recordExtractionFailure } from "./persistence.js";
import { extractTicketCode } from "./ticketExtractor.js";
import { WhatsAppClient } from "./whatsapp.js";

const whatsapp = new WhatsAppClient();

export type InboundHandleResult =
  | { kind: "ignored"; reason: string }
  | { kind: "no_code" }
  | { kind: "queued"; job: ValidationJob; duplicate: boolean };

export async function prepareInboundForProcessing(inbound: InboundWhatsAppMessage): Promise<InboundHandleResult> {
  if (inbound.mensagem.length > config.maxMessageLength) {
    return { kind: "ignored", reason: "mensagem_muito_longa" };
  }

  const extraction = extractTicketCode(inbound.mensagem);

  if (!extraction.codigo_encontrado || !extraction.codigo) {
    await whatsapp.sendText(inbound.numero, buildExtractionFailureMessage());
    await recordExtractionFailure({
      numero: inbound.numero,
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
      numero: inbound.numero,
      mensagem: inbound.mensagem,
      codigo: extraction.codigo,
      raw: inbound.raw,
      createdAt: new Date().toISOString()
    };

    return { kind: "queued", job, duplicate: false };
  }

  const created = await createValidationJob({
    numero: inbound.numero,
    mensagem: inbound.mensagem,
    codigo: extraction.codigo,
    externalMessageId: inbound.externalMessageId,
    raw: inbound.raw
  });

  return { kind: "queued", ...created };
}
