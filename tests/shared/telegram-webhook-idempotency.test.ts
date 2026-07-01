import {
  buildTelegramWebhookIdempotencyDescriptor,
  shouldProcessTelegramWebhookUpdate,
  type TelegramUpdate,
} from "../../src/shared/telegram-webhook-idempotency";

describe("shared/telegram-webhook-idempotency", () => {
  test("builds a message descriptor from update_id", () => {
    const update: TelegramUpdate = {
      update_id: 123,
      message: {
        message_id: 42,
        chat: { id: 999 },
      },
    };

    expect(buildTelegramWebhookIdempotencyDescriptor(update)).toEqual({
      eventType: "message",
      idempotencyKey: "telegram:update:123",
      payload: update,
    });
  });

  test("builds a callback descriptor from callback_query.id", () => {
    const update: TelegramUpdate = {
      update_id: 456,
      callback_query: {
        id: "callback-xyz",
        message: {
          message_id: 77,
          chat: { id: 999 },
        },
      },
    };

    expect(buildTelegramWebhookIdempotencyDescriptor(update)).toEqual({
      eventType: "callback",
      idempotencyKey: "telegram:callback:callback-xyz",
      payload: {
        update_id: 456,
        callback_query: update.callback_query,
      },
    });
  });

  test("returns false on the second claim for the same message update", async () => {
    const claimed = new Set<string>();
    const claim = async ({ idempotencyKey }: { idempotencyKey: string }) => {
      if (claimed.has(idempotencyKey)) return false;
      claimed.add(idempotencyKey);
      return true;
    };

    const update: TelegramUpdate = {
      update_id: 789,
      message: {
        message_id: 10,
        chat: { id: 999 },
      },
    };

    await expect(shouldProcessTelegramWebhookUpdate(update, claim)).resolves.toBe(true);
    await expect(shouldProcessTelegramWebhookUpdate(update, claim)).resolves.toBe(false);
  });

  test("returns false on the second claim for the same callback query", async () => {
    const claimed = new Set<string>();
    const claim = async ({ idempotencyKey }: { idempotencyKey: string }) => {
      if (claimed.has(idempotencyKey)) return false;
      claimed.add(idempotencyKey);
      return true;
    };

    const update: TelegramUpdate = {
      update_id: 790,
      callback_query: {
        id: "callback-dup",
        message: {
          message_id: 11,
          chat: { id: 999 },
        },
      },
    };

    await expect(shouldProcessTelegramWebhookUpdate(update, claim)).resolves.toBe(true);
    await expect(shouldProcessTelegramWebhookUpdate(update, claim)).resolves.toBe(false);
  });
});
