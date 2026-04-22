import { randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { log } from "../logger.js";
import { recordSecurityEvent } from "./persistence.js";

export type RequestSecurityContext = {
  ip: string;
  userAgent: string;
  getHeader: (name: string) => string | undefined | null;
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function authorizeRequest(context: RequestSecurityContext): Promise<boolean> {
  if (config.webhookAllowedIps.length > 0 && !config.webhookAllowedIps.includes(context.ip)) {
    await deny("ip_nao_permitido", context, { ip: context.ip });
    return false;
  }

  if (!config.webhookSecret) {
    log("warn", "WEBHOOK_SECRET não configurado; webhook sem segredo compartilhado");
    return true;
  }

  const received = context.getHeader("x-webhook-secret") ?? "";

  if (!safeEqual(received, config.webhookSecret)) {
    await deny("segredo_invalido", context, {});
    return false;
  }

  return true;
}

async function deny(eventType: string, context: RequestSecurityContext, metadata: Record<string, unknown>): Promise<void> {
  log("warn", "Requisição bloqueada por regra de segurança", {
    eventType,
    ip: context.ip
  });

  await recordSecurityEvent({
    id: randomUUID(),
    eventType,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata
  }).catch(() => undefined);
}
