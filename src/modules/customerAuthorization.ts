import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { config } from "../config.js";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export type AuthorizedCustomerId = {
  channel: string;
  phone: string;
  customerName: string | null;
  note: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function getSql(): NeonQueryFunction<false, false> {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL nao configurada");
  }

  if (!sqlClient) {
    sqlClient = neon(config.databaseUrl);
  }

  return sqlClient;
}

function pickString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function normalizeAuthorizedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }

  return digits;
}

export async function isCustomerAuthorized(channel: string, phone: string): Promise<boolean> {
  if (!config.databaseUrl) {
    return true;
  }

  const normalizedPhone = normalizeAuthorizedPhone(phone);

  if (!normalizedPhone) {
    return false;
  }

  const rows = await getSql()`
    SELECT 1
    FROM authorized_customer_ids
    WHERE channel = ${channel}
      AND phone = ${normalizedPhone}
      AND enabled = true
    LIMIT 1
  `;

  return rows.length > 0;
}

export async function saveAuthorizedCustomerId(input: {
  channel: string;
  phone: string;
  customerName: string | null;
  note: string | null;
}): Promise<void> {
  if (!config.databaseUrl) {
    return;
  }

  const normalizedPhone = normalizeAuthorizedPhone(input.phone);

  if (!normalizedPhone) {
    throw new Error("Telefone invalido.");
  }

  await getSql()`
    INSERT INTO authorized_customer_ids (channel, phone, customer_name, note, enabled)
    VALUES (${input.channel}, ${normalizedPhone}, ${input.customerName}, ${input.note}, true)
    ON CONFLICT (channel, phone) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      note = EXCLUDED.note,
      enabled = true,
      updated_at = now()
  `;
}

export async function disableAuthorizedCustomerId(channel: string, phone: string): Promise<void> {
  if (!config.databaseUrl) {
    return;
  }

  const normalizedPhone = normalizeAuthorizedPhone(phone);

  if (!normalizedPhone) {
    return;
  }

  await getSql()`
    UPDATE authorized_customer_ids
    SET enabled = false, updated_at = now()
    WHERE channel = ${channel}
      AND phone = ${normalizedPhone}
  `;
}

export async function enableAuthorizedCustomerId(channel: string, phone: string): Promise<void> {
  if (!config.databaseUrl) {
    return;
  }

  const normalizedPhone = normalizeAuthorizedPhone(phone);

  if (!normalizedPhone) {
    return;
  }

  await getSql()`
    UPDATE authorized_customer_ids
    SET enabled = true, updated_at = now()
    WHERE channel = ${channel}
      AND phone = ${normalizedPhone}
  `;
}

export async function loadAuthorizedCustomerIds(channel?: string): Promise<AuthorizedCustomerId[]> {
  if (!config.databaseUrl) {
    return [];
  }

  const rows = channel
    ? await getSql()`
        SELECT channel, phone, customer_name, note, enabled, created_at, updated_at
        FROM authorized_customer_ids
        WHERE channel = ${channel}
        ORDER BY enabled DESC, updated_at DESC, phone ASC
      `
    : await getSql()`
        SELECT channel, phone, customer_name, note, enabled, created_at, updated_at
        FROM authorized_customer_ids
        ORDER BY enabled DESC, updated_at DESC, phone ASC
      `;

  return rows.map((row) => ({
    channel: String(row.channel),
    phone: String(row.phone),
    customerName: pickString(row.customer_name),
    note: pickString(row.note),
    enabled: Boolean(row.enabled),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }));
}
