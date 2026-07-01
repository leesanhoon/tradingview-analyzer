export type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: {
    id: number;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramWebhookIdempotencyEventType = "message" | "callback";

export type TelegramWebhookIdempotencyDescriptor = {
  eventType: TelegramWebhookIdempotencyEventType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export function buildTelegramWebhookIdempotencyDescriptor(
  update: TelegramUpdate,
): TelegramWebhookIdempotencyDescriptor | null {
  if (update.message) {
    return {
      eventType: "message",
      idempotencyKey: `telegram:update:${update.update_id}`,
      payload: update,
    };
  }

  if (update.callback_query) {
    return {
      eventType: "callback",
      idempotencyKey: `telegram:callback:${update.callback_query.id}`,
      payload: {
        update_id: update.update_id,
        callback_query: update.callback_query,
      },
    };
  }

  return null;
}

export async function shouldProcessTelegramWebhookUpdate(
  update: TelegramUpdate,
  claim: (descriptor: TelegramWebhookIdempotencyDescriptor) => Promise<boolean>,
): Promise<boolean> {
  const descriptor = buildTelegramWebhookIdempotencyDescriptor(update);
  if (!descriptor) {
    return true;
  }

  return claim(descriptor);
}
