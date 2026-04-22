import express from "express";
import { config } from "./config.js";
import { log } from "./logger.js";
import { prepareInboundForProcessing } from "./modules/inboundHandler.js";
import { JobQueue } from "./modules/jobQueue.js";
import { processValidationJob } from "./modules/processor.js";
import { authorizeRequest, authorizeTelegramRequest } from "./modules/security.js";
import { parseInboundTelegramMessage } from "./modules/telegramWebhookParser.js";
import { parseInboundWhatsAppMessage } from "./modules/webhookParser.js";

const app = express();

app.use(express.json({ limit: "20mb" }));

const queue = new JobQueue(processValidationJob);

async function authorizeExpressRequest(req: express.Request): Promise<boolean> {
  return await authorizeRequest({
    ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(),
    userAgent: String(req.headers["user-agent"] ?? ""),
    getHeader: (name) => req.header(name)
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    queue: queue.stats()
  });
});

app.post("/webhook/whatsapp", async (req, res) => {
  if (!(await authorizeExpressRequest(req))) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const inbound = parseInboundWhatsAppMessage(req.body);

  if (!inbound) {
    res.status(202).json({ ok: true, ignored: true, reason: "mensagem_sem_texto_ou_numero" });
    return;
  }

  const result = await prepareInboundForProcessing(inbound);

  if (result.kind !== "queued") {
    res.status(202).json({ ok: true, queued: false, reason: result.kind });
    return;
  }

  if (!result.duplicate) {
    queue.enqueue(result.job);
  }

  res.status(202).json({
    ok: true,
    queued: true,
    duplicate: result.duplicate,
    jobId: result.job.id,
    codigo: result.job.codigo
  });
});

app.post("/webhook/telegram", async (req, res) => {
  const authorized = await authorizeTelegramRequest({
    ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(),
    userAgent: String(req.headers["user-agent"] ?? ""),
    getHeader: (name) => req.header(name)
  });

  if (!authorized) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const inbound = parseInboundTelegramMessage(req.body);

  if (!inbound) {
    res.status(202).json({ ok: true, ignored: true, reason: "mensagem_sem_texto_ou_chat" });
    return;
  }

  const result = await prepareInboundForProcessing(inbound);

  if (result.kind !== "queued") {
    res.status(202).json({ ok: true, queued: false, reason: result.kind });
    return;
  }

  if (!result.duplicate) {
    queue.enqueue(result.job);
  }

  res.status(202).json({
    ok: true,
    queued: true,
    duplicate: result.duplicate,
    jobId: result.job.id,
    codigo: result.job.codigo
  });
});

app.post("/validate", async (req, res) => {
  if (!(await authorizeExpressRequest(req))) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const channel = req.body?.channel === "telegram" ? "telegram" : "whatsapp";
  const numero = typeof req.body?.numero === "string" ? req.body.numero.replace(/\D/g, "") : "";
  const chatId = typeof req.body?.chatId === "string" || typeof req.body?.chatId === "number"
    ? String(req.body.chatId)
    : "";
  const recipientId = channel === "telegram" ? chatId : numero;
  const mensagem = typeof req.body?.mensagem === "string" ? req.body.mensagem : "";

  if (!recipientId || !mensagem) {
    res.status(400).json({ ok: false, error: "destinatario e mensagem sao obrigatorios" });
    return;
  }

  const result = await prepareInboundForProcessing({
    channel,
    recipientId,
    mensagem,
    externalMessageId: typeof req.body?.messageId === "string" ? req.body.messageId : null,
    raw: req.body
  });

  if (result.kind !== "queued") {
    res.status(202).json({ ok: true, queued: false, reason: result.kind });
    return;
  }

  if (!result.duplicate) {
    queue.enqueue(result.job);
  }

  res.status(202).json({
    ok: true,
    queued: true,
    duplicate: result.duplicate,
    jobId: result.job.id,
    codigo: result.job.codigo
  });
});

app.listen(config.port, () => {
  log("info", "Servidor iniciado", {
    port: config.port,
    targetUrl: config.targetUrl,
    whatsappProvider: config.whatsapp.provider,
    telegramEnabled: Boolean(config.telegram.botToken),
    confirmPreTicket: config.confirmPreTicket
  });
});
