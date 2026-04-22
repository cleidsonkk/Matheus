import type { InboundMessage } from "../types.js";

function pickTelegramText(message: Record<string, any>): string {
  const text = message.text;
  const caption = message.caption;

  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  if (typeof caption === "string" && caption.trim()) {
    return caption.trim();
  }

  return "";
}

export function parseInboundTelegramMessage(body: unknown): InboundMessage | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const update = body as Record<string, any>;
  const message = update.message ?? update.edited_message ?? update.channel_post;

  if (!message || typeof message !== "object") {
    return null;
  }

  const chatId = message.chat?.id;
  const text = pickTelegramText(message);

  if ((typeof chatId !== "number" && typeof chatId !== "string") || !text) {
    return null;
  }

  return {
    channel: "telegram",
    recipientId: String(chatId),
    mensagem: text,
    externalMessageId: update.update_id !== undefined ? `telegram:${update.update_id}` : null,
    raw: body
  };
}
