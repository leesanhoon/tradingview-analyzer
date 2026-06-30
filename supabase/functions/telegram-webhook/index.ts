type TelegramUpdate = {
  message?: TelegramMessage;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: {
    id: number;
  };
};

type WorkflowConfig = {
  file: string;
  description: string;
  parseInputs?: (args: string[]) => Record<string, string>;
};

type WorkflowDispatchResult = {
  workflow_run_id?: number;
  run_url?: string;
  html_url?: string;
};

const COMMANDS: Record<string, WorkflowConfig> = {
  "/analyze": {
    file: "analyze.yml",
    description: "workflow phân tích biểu đồ",
  },
  "/match_odds": {
    file: "match-odds.yml",
    description: "workflow quét kèo bóng đá",
  },
  "/fetch_matches": {
    file: "fetch-matches-list.yml",
    description: "workflow cập nhật danh sách trận đấu",
  },
  "/lottery": {
    file: "lottery.yml",
    description: "workflow quét kết quả xổ số",
  },
  "/lottery_predict": {
    file: "lottery-predict.yml",
    description: "workflow dự đoán xổ số",
  },
  "/lottery_verify": {
    file: "lottery-verify.yml",
    description: "workflow xác minh kết quả xổ số theo miền",
    parseInputs: (args) => {
      const region = args[0]?.trim().toLowerCase();
      const allowedRegions = new Set(["mien-bac", "mien-trung", "mien-nam"]);

      if (!region || !allowedRegions.has(region)) {
        throw new Error("Cách dùng: /lottery_verify mien-bac|mien-trung|mien-nam");
      }

      return { region };
    },
  },
  "/lottery_backfill": {
    file: "lottery-backfill.yml",
    description: "workflow bổ sung lịch sử xổ số theo số ngày",
    parseInputs: (args) => {
      const rawDays = args[0]?.trim();
      if (!rawDays) {
        return { days: "1095" };
      }

      if (!/^\d+$/.test(rawDays)) {
        throw new Error("Cách dùng: /lottery_backfill [days]");
      }

      const days = Number.parseInt(rawDays, 10);
      if (days < 1 || days > 3650) {
        throw new Error("days phải nằm trong khoảng 1-3650");
      }

      return { days: String(days) };
    },
  },
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildHelpMessage(): string {
  const lines = [
    "Các lệnh hỗ trợ:",
    "/help - Xem danh sách lệnh",
    "/analyze - Phân tích biểu đồ",
    "/match_odds - Quét kèo bóng đá",
    "/fetch_matches - Cập nhật danh sách trận đấu",
    "/lottery - Quét kết quả xổ số",
    "/lottery_predict - Dự đoán xổ số",
    "/lottery_verify mien-nam - Xác minh kết quả theo miền Nam",
    "/lottery_verify mien-trung - Xác minh kết quả theo miền Trung",
    "/lottery_verify mien-bac - Xác minh kết quả theo miền Bắc",
    "/lottery_backfill [days] - Bổ sung lịch sử, mặc định 1095 ngày",
  ];

  return lines.join("\n");
}

function parseCommand(text: string): { command: string; args: string[] } {
  const [rawCommand = "", ...args] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase().replace(/@[\w_]+$/, "");
  return { command, args };
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${body}`);
  }
}

async function dispatchWorkflow(
  githubToken: string,
  owner: string,
  repo: string,
  ref: string,
  workflow: WorkflowConfig,
  inputs: Record<string, string>,
): Promise<WorkflowDispatchResult | null> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow.file}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref,
        inputs,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${body}`);
  }

  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as WorkflowDispatchResult;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  let botToken: string | undefined;
  let allowedChatId: string | undefined;
  let messageChatId: number | undefined;

  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    botToken = getEnv("TELEGRAM_BOT_TOKEN");
    allowedChatId = getEnv("TELEGRAM_CHAT_ID");
    const webhookSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");
    const githubToken = getEnv("GITHUB_PAT");
    const githubOwner = getEnv("GITHUB_OWNER");
    const githubRepo = getEnv("GITHUB_REPO");
    const githubRef = Deno.env.get("GITHUB_REF") ?? "main";

    const requestSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (requestSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;

    if (!message?.text) {
      return Response.json({ ok: true, ignored: "no-text-message" });
    }

    messageChatId = message.chat.id;

    if (String(message.chat.id) !== allowedChatId) {
      return new Response("Forbidden", { status: 403 });
    }

    const { command, args } = parseCommand(message.text);
    if (command === "/help" || command === "/start") {
      await sendTelegramMessage(botToken, message.chat.id, buildHelpMessage());
      return Response.json({ ok: true, command });
    }

    const workflow = COMMANDS[command];
    if (!workflow) {
      await sendTelegramMessage(
        botToken,
        message.chat.id,
        `Lệnh không hợp lệ: ${command}\n\n${buildHelpMessage()}`,
      );
      return Response.json({ ok: true, command, ignored: "unknown-command" });
    }

    let inputs: Record<string, string>;
    try {
      inputs = workflow.parseInputs ? workflow.parseInputs(args) : {};
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await sendTelegramMessage(botToken, message.chat.id, messageText);
      return Response.json({ ok: true, command, ignored: "invalid-input" });
    }

    const dispatchResult = await dispatchWorkflow(githubToken, githubOwner, githubRepo, githubRef, workflow, inputs);

    const inputSummary =
      Object.keys(inputs).length === 0
        ? ""
        : `\nInputs: ${Object.entries(inputs)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ")}`;
    const runSummary = dispatchResult?.html_url ? `\nRun: ${dispatchResult.html_url}` : "";

    await sendTelegramMessage(
      botToken,
      message.chat.id,
      `Đã kích hoạt ${workflow.description} (${workflow.file})${inputSummary}${runSummary}`,
    );

    return Response.json({ ok: true, command, workflow: workflow.file, inputs, dispatchResult });
  } catch (error) {
    console.error(error);

    if (botToken && allowedChatId && messageChatId && String(messageChatId) === allowedChatId) {
      try {
        const messageText = error instanceof Error ? error.message : String(error);
        await sendTelegramMessage(botToken, messageChatId, `Không thể xử lý lệnh:\n${messageText}`);
      } catch (notifyError) {
        console.error("Failed to send Telegram error message", notifyError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
