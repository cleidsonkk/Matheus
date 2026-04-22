export type ExtractionResult = {
  codigo_encontrado: boolean;
  codigo: string | null;
  mensagem_original: string;
};

export type TicketStatus = "encontrado" | "nao_encontrado" | "erro";

export type TicketSearchResult = {
  status: TicketStatus;
  dados_bilhete: Record<string, unknown> | null;
  html_resultado: string;
  texto_resultado: string;
};

export type TicketConfirmationResult = {
  confirmado: boolean;
  codigo_confirmacao: string | null;
  screenshot_base64: string | null;
  screenshot_path: string | null;
  mensagem_erro: string | null;
  status: TicketStatus;
  codigo_bilhete: string;
  dados_bilhete: Record<string, unknown> | null;
};

export type InboundWhatsAppMessage = {
  numero: string;
  mensagem: string;
  externalMessageId: string | null;
  raw: unknown;
};

export type ValidationJob = {
  id: string;
  externalMessageId: string | null;
  numero: string;
  mensagem: string;
  codigo: string;
  raw: unknown;
  createdAt: string;
};
