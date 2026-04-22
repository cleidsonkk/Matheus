import { log } from "../logger.js";
import type { ValidationJob } from "../types.js";
import { appendAuditLog } from "./auditLog.js";
import { buildCustomerMessage } from "./messageBuilder.js";
import { sendImage, sendText } from "./notifier.js";
import { markDeliveryStatus, markJobFinished, markJobProcessing } from "./persistence.js";
import { TicketAutomation } from "./ticketAutomation.js";

const automation = new TicketAutomation();

export async function processValidationJob(job: ValidationJob): Promise<void> {
  log("info", "Iniciando validação de bilhete", {
    jobId: job.id,
    channel: job.channel,
    recipientId: job.recipientId,
    codigo: job.codigo
  });

  await markJobProcessing(job.id);

  const result = await automation.validateAndConfirm(job.codigo);
  const message = buildCustomerMessage(result);

  await markJobFinished(job.id, result, message);

  let textSent = false;
  let imageSent = false;

  try {
    await sendText(job.channel, job.recipientId, message);
    textSent = true;

    if (result.screenshot_base64) {
      await sendImage(job.channel, job.recipientId, result.screenshot_base64, `Comprovante do bilhete ${job.codigo}`);
      imageSent = true;
    }

    await markDeliveryStatus({
      jobId: job.id,
      textSent,
      imageSent,
      deliveryError: null
    });
  } catch (error) {
    await markDeliveryStatus({
      jobId: job.id,
      textSent,
      imageSent,
      deliveryError: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }

  await appendAuditLog({
    timestamp: new Date().toISOString(),
    jobId: job.id,
    channel: job.channel,
    recipientId: job.recipientId,
    codigo: job.codigo,
    status: result.status,
    confirmado: result.confirmado,
    codigo_confirmacao: result.codigo_confirmacao,
    screenshot_path: result.screenshot_path,
    mensagem_erro: result.mensagem_erro
  });

  log("info", "Validação finalizada", {
    jobId: job.id,
    channel: job.channel,
    recipientId: job.recipientId,
    codigo: job.codigo,
    status: result.status,
    confirmado: result.confirmado
  });
}
