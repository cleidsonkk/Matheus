import type { TicketConfirmationResult, TicketStatus } from "../types.js";
import { formatMoney, type CustomerCreditSummary } from "./credit.js";

type MessageInput = Pick<
  TicketConfirmationResult,
  "confirmado" | "codigo_bilhete" | "codigo_confirmacao" | "mensagem_erro" | "dados_bilhete"
> & {
  status: TicketStatus;
  credit?: TicketConfirmationResult["credit"];
};

function getStatusDescription(result: MessageInput): string | null {
  const ticket = result.dados_bilhete?.aposta;

  if (!ticket || typeof ticket !== "object") {
    return null;
  }

  const statusDescription = (ticket as Record<string, unknown>).status_desc;
  return typeof statusDescription === "string" && statusDescription.trim() ? statusDescription.trim() : null;
}

function getReadableErrorMessage(error: string | null): string | null {
  const raw = error?.trim();

  if (!raw) {
    return null;
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const candidates = jsonMatch ? [jsonMatch[0], raw] : [raw];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const message = parsed.Message ?? parsed.message ?? parsed.error;

      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // The site sometimes returns plain text instead of JSON.
    }
  }

  const cleaned = raw.replace(/^Erro ao consultar o bilhete:\s*/i, "").trim();

  if (!cleaned || cleaned.length > 240 || cleaned.includes("<html") || cleaned.includes("<!doctype")) {
    return null;
  }

  return cleaned;
}

export function buildCustomerMessage(result: MessageInput): string {
  if (result.status === "limite_excedido") {
    const credit = result.credit;
    const lines = [
      "\u26a0\ufe0f Este bilhete ultrapassa seu limite atual.",
      `C\u00f3digo: ${result.codigo_bilhete}`
    ];

    if (credit?.limit !== undefined) {
      lines.push(`Seu limite: ${formatMoney(credit.limit)}`);
      lines.push(`Em aberto: ${formatMoney(credit.outstanding)} \u00b7 Bilhete: ${formatMoney(credit.ticketAmount ?? 0)}`);
      lines.push(`Dispon\u00edvel agora: ${formatMoney(credit.available)}`);

      if ((credit.requiredPayment ?? 0) > 0) {
        lines.push(`Para confirmar, fa\u00e7a pagamento m\u00ednimo de ${formatMoney(credit.requiredPayment ?? 0)}.`);
      }
    }

    lines.push("Ou aguarde o administrador liberar mais limite.");
    return lines.join("\n");
  }

  if (result.confirmado) {
    const lines = [
      "\u2705 Bilhete confirmado com sucesso!",
      `C\u00f3digo: ${result.codigo_bilhete}`
    ];

    if (result.codigo_confirmacao) {
      lines.push(`Confirma\u00e7\u00e3o: ${result.codigo_confirmacao}`);
    }

    if (result.credit?.available !== undefined) {
      lines.push(`Limite dispon\u00edvel: ${formatMoney(result.credit.available)}`);
    }

    lines.push("Guarde este comprovante. Boa sorte! \ud83c\udf40");
    return lines.join("\n");
  }

  if (result.status === "encontrado" && result.mensagem_erro?.includes("pendente de confirmacao")) {
    const statusDescription = getStatusDescription(result);

    return [
      "\u2705 Bilhete localizado.",
      `C\u00f3digo: ${result.codigo_bilhete}`,
      statusDescription ? `Status: ${statusDescription}` : "Status: j\u00e1 confirmado",
      "Este bilhete n\u00e3o est\u00e1 pendente de confirma\u00e7\u00e3o."
    ].join("\n");
  }

  if (result.status === "nao_encontrado") {
    return [
      "\u26a0\ufe0f N\u00e3o conseguimos localizar o c\u00f3digo informado.",
      "Verifique se digitou corretamente e envie novamente."
    ].join("\n");
  }

  if (result.status === "erro") {
    const readableError = getReadableErrorMessage(result.mensagem_erro);

    if (readableError) {
      return [
        "Nao foi possivel confirmar este bilhete.",
        `Codigo: ${result.codigo_bilhete}`,
        `Motivo: ${readableError}`
      ].join("\n");
    }
  }

  return [
    "\ud83d\udd04 Tivemos uma instabilidade ao consultar seu bilhete.",
    "Tente novamente em alguns minutos."
  ].join("\n");
}

export function buildExtractionFailureMessage(): string {
  return [
    "\u26a0\ufe0f N\u00e3o consegui identificar o c\u00f3digo do bilhete.",
    "Envie o c\u00f3digo com 12 caracteres, com ou sem espa\u00e7os.",
    "Exemplo: ABCD 1234 WXYZ"
  ].join("\n");
}

export function buildMultipleCodesMessage(summary: CustomerCreditSummary | null): string {
  const lines = [
    "\u26a0\ufe0f Envie apenas 1 c\u00f3digo de bilhete por vez.",
    "Assim consigo validar o limite e confirmar com seguran\u00e7a."
  ];

  if (summary) {
    lines.push(`Seu limite: ${formatMoney(summary.limit)}`);
    lines.push(`Dispon\u00edvel agora: ${formatMoney(summary.available)}`);
  }

  return lines.join("\n");
}

export function buildTelegramWelcomeMessage(): string {
  return [
    "Ol\u00e1! Envie o c\u00f3digo do bilhete para valida\u00e7\u00e3o.",
    "Pode mandar com espa\u00e7os ou tudo junto.",
    "Para aparecer com celular no painel, toque em Compartilhar meu telefone.",
    "Exemplo: ABCD 1234 WXYZ"
  ].join("\n");
}

export function buildTelegramContactRegisteredMessage(phoneNumber: string): string {
  return [
    "\u2705 Telefone cadastrado com sucesso.",
    `Celular: ${phoneNumber}`,
    "Agora envie 1 c\u00f3digo de bilhete por vez."
  ].join("\n");
}

export function buildTelegramContactRejectedMessage(): string {
  return [
    "\u26a0\ufe0f Para sua seguran\u00e7a, envie o seu pr\u00f3prio contato pelo bot\u00e3o Compartilhar meu telefone.",
    "Depois envie 1 c\u00f3digo de bilhete por vez."
  ].join("\n");
}

export function buildUnauthorizedCustomerMessage(): string {
  return [
    "Seu n\u00famero ainda n\u00e3o est\u00e1 habilitado para validar bilhetes neste atendimento.",
    "Por favor, solicite ao administrador o cadastro do seu celular para liberar a confirma\u00e7\u00e3o.",
    "Assim que o cadastro for conclu\u00eddo, envie novamente o c\u00f3digo do bilhete."
  ].join("\n");
}
