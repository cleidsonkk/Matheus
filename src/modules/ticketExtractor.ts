import type { ExtractionResult } from "../types.js";

const CODE_PATTERN = /(?:^|[^A-Za-z0-9])([A-Za-z0-9]{4})[\s-]*([A-Za-z0-9]{4})[\s-]*([A-Za-z0-9]{4})(?![A-Za-z0-9])/g;

type Candidate = {
  index: number;
  groups: [string, string, string];
};

function hasDigit(value: string): boolean {
  return /\d/.test(value);
}

export function extractTicketCode(message: string): ExtractionResult {
  const original = message ?? "";
  const candidates: Candidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_PATTERN.exec(original)) !== null) {
    candidates.push({
      index: match.index,
      groups: [match[1], match[2], match[3]]
    });

    CODE_PATTERN.lastIndex = match.index + 1;
  }

  if (candidates.length === 0) {
    return {
      codigo_encontrado: false,
      codigo: null,
      mensagem_original: original
    };
  }

  const candidate = [...candidates]
    .reverse()
    .find((item) => hasDigit(item.groups[0]) || hasDigit(item.groups[2]))
    ?? candidates[candidates.length - 1];

  return {
    codigo_encontrado: true,
    codigo: candidate.groups.join(" ").toUpperCase(),
    mensagem_original: original
  };
}
