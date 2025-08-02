import { ClientEvents, Message } from "discord.js-selfbot-v13";
import { z } from "zod";
import Selfbot from "./structures/client.js";
import { IPCMessage } from "./structures/ipc.js";

// Extend ClientEvents with our custom events
declare module "discord.js-selfbot-v13" {
  interface ClientEvents {
    ipcMessage: [IPCMessage];
  }
}
export const EnvTokenParser = z.string().min(60).includes(".");
export const CommandParser = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  run: z.function().args(
    z.object({
      selfbot: z.custom<Selfbot>(),
      message: z.custom<Message>(),
      args: z.array(z.string()),
    })
  ),
});
export const EventParser = z.object({
  name: z.custom<keyof ClientEvents>(),
  run: z.function().returns(z.any()),
});
