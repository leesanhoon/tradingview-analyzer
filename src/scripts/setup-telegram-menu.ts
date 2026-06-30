import "../shared/env.js";
import { setChatMenuButton, setMyCommands } from "../shared/telegram.js";

async function main(): Promise<void> {
  const commands = [
    { command: "help", description: "Hướng dẫn sử dụng" },
  ];

  console.log("Setting Telegram commands...");
  await setMyCommands(commands);
  console.log("✓ Commands updated");

  console.log("Setting Telegram menu button...");
  await setChatMenuButton();
  console.log("✓ Menu button updated");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
