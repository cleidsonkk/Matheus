import type { TicketConfirmationResult, TicketStatus } from "../types.js";

type MessageInput = Pick<
  TicketConfirmationResult,
  "confirmado" | "codigo_bilhete" | "codigo_confirmacao" | "mensagem_erro" | "dados_bilhete"
> & {
  status: TicketStatus;
};

function getStatusDescription(result: MessageInput): string | null {
  const ticket = result.dados_bilhete?.aposta;

  if (!ticket || typeof ticket !== "object") {
    return null;
  }

  const statusDescription = (ticket as Record<string, unknown>).status_desc;
  return typeof statusDescription === "string" && statusDescription.trim() ? statusDescription.trim() : null;
}

export function buildCustomerMessage(result: MessageInput): string {
  if (result.confirmado) {
    const lines = [
      "✅ Bilhete confirmado com sucesso!",
      `Código: ${result.codigo_bilhete}`
    ];

    if (result.codigo_confirmacao) {
      lines.push(`Confirmação: ${result.codigo_confirmacao}`);
    }

    lines.push("Guarde este comprovante. Boa sorte! 🍀");
    return lines.join("\n");
  }

  if (result.status === "encontrado" && result.mensagem_erro?.includes("pendente de confirmacao")) {
    const statusDescription = getStatusDescription(result);

    return [
      "✅ Bilhete localizado.",
      `Código: ${result.codigo_bilhete}`,
      statusDescription ? `Status: ${statusDescription}` : "Status: já confirmado",
      "Este bilhete não está pendente de confirmação."
    ].join("\n");
  }

  if (result.status === "nao_encontrado") {
    return [
      "⚠️ Não conseguimos localizar o código informado.",
      "Verifique se digitou corretamente e envie novamente."
    ].join("\n");
  }

  return [
    "🔄 Tivemos uma instabilidade ao consultar seu bilhete.",
    "Tente novamente em alguns minutos."
  ].join("\n");
}

export function buildExtractionFailureMessage(): string {
  return [
    "⚠️ Não consegui identificar o código do bilhete.",
    "Envie o código com 12 caracteres, com ou sem espaços.",
    "Exemplo: ABCD 1234 WXYZ"
  ].join("\n");
}

export function buildTelegramWelcomeMessage(): string {
  return [
    "Olá! Envie o código do bilhete para validação.",
    "Pode mandar com espaços ou tudo junto.",
    "Exemplo: ABCD 1234 WXYZ"
  ].join("\n");
}
