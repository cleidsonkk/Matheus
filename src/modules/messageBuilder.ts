import type { TicketConfirmationResult, TicketStatus } from "../types.js";

type MessageInput = Pick<TicketConfirmationResult, "confirmado" | "codigo_bilhete" | "codigo_confirmacao" | "mensagem_erro"> & {
  status: TicketStatus;
};

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
    "Envie no formato XXXX XXXX XXXX."
  ].join("\n");
}
