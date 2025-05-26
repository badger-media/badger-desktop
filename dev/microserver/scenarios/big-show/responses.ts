import { proc } from "../../lib";
import { z } from "zod";
import { cloneDeep } from "lodash";
import type { API as Real } from "../../../../src/types/serverAPI";

import { sampleShow as origSampleShow } from "../default/responses";
import {
  CompleteRundownType,
  CompleteShowModel,
} from "@/types/serverAPILenses";

const sampleShow = cloneDeep(origSampleShow);
const N_RUNDOWN_ITEMS = 50;
const base = cloneDeep(sampleShow.rundowns[0].items[0]);
for (let i = 2; i <= N_RUNDOWN_ITEMS; i++) {
  const item = cloneDeep(base);
  item.id = i;
  item.order = i;
  item.name = `Test Item ${i}`;
  sampleShow.rundowns[0].items.push(item);
}

const responses = {
  "shows.listUpcoming": proc
    .input(
      z
        .object({
          gracePeriodHours: z.number().default(0),
        })
        .optional(),
    )
    .output(z.custom<CompleteShowModel[]>())
    .query(async () => {
      return [sampleShow];
    }),
  "shows.get": proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteShowModel>())
    .query(async ({ input }) => {
      if (input.id !== sampleShow.id) {
        throw new Error("Not found");
      }
      return sampleShow;
    }) satisfies Real["shows"]["get"],
  "shows.getVersion": proc
    .input(z.object({ id: z.number() }))
    .output(z.object({ version: z.number() }))
    .query(async ({ input }) => {
      if (input.id !== sampleShow.id) {
        throw new Error("Not found");
      }
      return { version: sampleShow.version };
    }) satisfies Real["shows"]["getVersion"],
  "rundowns.get": proc
    .input(z.object({ id: z.number() }))
    .output(z.custom<CompleteRundownType>())
    .query(async ({ input }) => {
      if (input.id !== sampleShow.rundowns[0].id) {
        throw new Error("Not found");
      }
      return sampleShow.rundowns[0];
    }) satisfies Real["rundowns"]["get"],
};

export default responses;
