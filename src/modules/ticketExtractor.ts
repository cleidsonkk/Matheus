import type { ExtractionResult } from "../types.js";

const CODE_PATTERN = /(?<![A-Za-z0-9])([A-Za-z0-9]{4})[\s-]*([A-Za-z0-9]{4})[\s-]*([A-Za-z0-9]{4})(?![A-Za-z0-9])/;

export function extractTicketCode(message: string): ExtractionResult {
  const original = message ?? "";
  const match = original.match(CODE_PATTERN);

  if (!match) {
    return {
      codigo_encontrado: false,
      codigo: null,
      mensagem_original: original
    };
  }

  return {
    codigo_encontrado: true,
    codigo: `${match[1]} ${match[2]} ${match[3]}`.toUpperCase(),
    mensagem_original: original
  };
}
