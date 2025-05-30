import got, { type Got } from "got";
import invariant from "@/common/invariant";
import { getOntimeSettings } from "../base/settings";
import { getLogger } from "../base/logging";

const logger = getLogger("ontime");

interface OntimeInfo {
  networkInterfaces: unknown[];
  version: number | string;
  serverPort: number;
  osc: unknown;
}

export interface OntimeBaseEvent {
  title: string;
  type: "event" | "delay" | "block";
  readonly revision?: number;
  readonly id: string;
}

export interface OntimeEvent extends OntimeBaseEvent {
  type: "event";
  subtitle: string;
  presenter: string;
  note: string;
  endAction: string;
  timerType: string;
  timeStart: number;
  timeEnd: number;
  duration: number;
  isPublic: boolean;
  skip: boolean;
  colour: string;
  user0: string;
  user1: string;
  user2: string;
  user3: string;
  user4: string;
  user5: string;
  user6: string;
  user7: string;
  user8: string;
  user9: string;
  delay: number;
  cue: number;
}

export type OntimeFullEvent = OntimeEvent | OntimeBaseEvent;

export class OntimeClient {
  private got!: Got;
  private constructor(public readonly host: string) {}

  public static async connect(host: string): Promise<OntimeClient> {
    const client = got.extend({
      prefixUrl: host,
    });
    let info: OntimeInfo;
    try {
      info = await client.get("ontime/info").json();
    } catch (e) {
      throw new Error(
        `Could not connect to Ontime at ${host}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    if (typeof info.version === "number") {
      if (info.version !== 2) {
        throw new Error(`Ontime at ${host} is not version 2`);
      }
    } else {
      if (info.version[0] !== "2") {
        throw new Error(`Ontime at ${host} is not version 2`);
      }
    }
    const result = new OntimeClient(host);
    result.got = client;
    return result;
  }

  public async getEvents(): Promise<OntimeFullEvent[]> {
    return this.got.get("events").json();
  }

  public async createEvent(
    event: Omit<OntimeFullEvent, "id" | "revision">,
  ): Promise<OntimeFullEvent> {
    return this.got.post("events", { json: event }).json();
  }

  public async editEvent(event: OntimeFullEvent): Promise<OntimeFullEvent> {
    return this.got.put("events", { json: event }).json();
  }

  public async reorderEvent(eventId: string, from: number, to: number) {
    return this.got
      .patch(`events/reorder`, { json: { eventId, from, to } })
      .json();
  }

  public async swapEvents(from: string, to: string) {
    return this.got.patch(`events/swap`, { json: { from, to } }).json();
  }

  public async applyDelay(eventID: string) {
    return this.got.patch(`events/applydelay/${eventID}`).json();
  }

  public async deleteEvent(event: OntimeFullEvent): Promise<void> {
    await this.got.delete(`events/${event.id}`);
  }

  public async deleteAllEvents(): Promise<void> {
    await this.got.delete(`events/all`);
  }
}

let ontimeInstance: OntimeClient | null;
export function isOntimeConnected() {
  return !!ontimeInstance;
}
export function getOntimeInstance() {
  invariant(ontimeInstance, "Ontime not connected");
  return ontimeInstance;
}

export async function createOntimeConnection(host: string) {
  ontimeInstance = await OntimeClient.connect(host);
}

export async function tryCreateOntimeConnection() {
  const settings = await getOntimeSettings();
  if (!settings) {
    return;
  }
  try {
    await createOntimeConnection(settings.host);
    logger.info("Successfully connected to Ontime");
  } catch (e) {
    logger.warn(
      "Could not connect to Ontime: " +
        (e instanceof Error ? e.message : String(e)),
      e,
    );
  }
}
