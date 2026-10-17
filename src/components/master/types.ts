import type { MasterOverview } from "@/lib/game/eventStore";
import type { Display } from "@/types";

export type Overview = MasterOverview;
export type Round = Overview["rounds"][number];
export type { Display };

/**
 * Sends one Master action. `success` is the notice to show afterwards; pass a function to word it from the
 * result, returning null for no notice. Resolves to the action's result, or undefined if it failed.
 */
export type Act = (payload: Record<string, unknown>, success?: string | ((result: unknown) => string | null)) => Promise<unknown>;

export type Notify = (notice: { text: string; error?: boolean } | null) => void;

export type TabProps = {
  overview: Overview;
  act: Act;
  busy: boolean;
  setNotice: Notify;
  /** Server clock minus this device's clock, in ms. */
  serverOffset: number;
};
