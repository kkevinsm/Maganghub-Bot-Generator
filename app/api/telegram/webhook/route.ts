import { type NextRequest } from "next/server";
import { TelegramUpdate } from "@/lib/telegram/types";
import { handleTelegramUpdate } from "@/lib/telegram/handler";

export const dynamic = "force-dynamic";

/**
 * POST Handler: Menerima Updates / Events dari Telegram Bot API Webhook
 */
export async function POST(request: NextRequest) {
  try {
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (configuredSecret && secretHeader !== configuredSecret) {
      console.warn("[Telegram Webhook] Invalid secret token.");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const update: TelegramUpdate = await request.json();

    if (update && (update.message || update.callback_query)) {
      await handleTelegramUpdate(update);
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[Telegram Webhook] Error handling update:", error);
    // Return 200 so Telegram does not retry failed updates infinitely
    return Response.json({ ok: false, error: "Internal Error" }, { status: 200 });
  }
}

/**
 * GET Handler: Cek status webhook
 */
export async function GET() {
  return Response.json({
    status: "online",
    service: "Mobogen Telegram Bot Webhook",
  });
}
