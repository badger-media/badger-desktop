import { z } from "zod";

export interface ServerConnection {
  connected: true;
  server: string;
}

export type ServerConnectionStatus = ServerConnection | { connected: false };

export const Integration = z.enum(["vmix", "obs", "ontime"]);
export type Integration = z.infer<typeof Integration>;
