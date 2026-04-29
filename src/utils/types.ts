export enum RSVPStatus {
  accepted = "accepted",
  declined = "declined",
  tentative = "tentative",
  pending = "pending",
}

export enum RepeatingFrequency {
  None = "none",
  Daily = "daily",
  Weekly = "weekly",
  Weekday = "weekdays",
  Monthly = "monthly",
  Quarterly = "quarterly",
  Yearly = "yearly",
}

export enum RSVPResponse {
  accepted = "accepted",
  declined = "declined",
  tentative = "tentative",
  pending = "pending",
}

export interface IRSVPResponse {
  participantId: string;
  response: RSVPResponse;
  timestamp: number;
}

export interface IScheduledNotification {
  label: string;
  scheduledAt: number;
}

export type NotificationPreference = "enabled" | "disabled";

/**
 * Reference to a Formstr form attached to a calendar event.
 *
 * Stored on a private calendar event as a `form` tag:
 *   ["form", naddr, responseKey?]
 *
 * The naddr is the Nostr address (NIP-19) of the form.
 * The optional responseKey is treated as opaque metadata in this phase —
 * its concrete meaning (submission key vs. response decryption key vs.
 * link-only key) is intentionally not interpreted here, so authoring
 * clients can round-trip it untouched until the protocol is settled.
 */
export interface IFormAttachment {
  naddr: string;
  responseKey?: string;
}

export interface ICalendarEvent {
  begin: number;
  description: string;
  kind: number;
  end: number;
  id: string;
  eventId: string;
  title: string;
  createdAt: number;
  categories: string[];
  participants: string[];
  rsvpResponses: IRSVPResponse[];
  reference: string[];
  image?: string;
  location: string[];
  geoHash: string[];
  website: string;
  user: string;
  isPrivateEvent: boolean;
  viewKey?: string;
  repeat: {
    rrule: string | null;
  };
  /**
   * Event-level notification preference.
   * If undefined, calendar-list preference should be used as fallback.
   */
  notificationPreference?: NotificationPreference;
  calendarId?: string;
  isInvitation?: boolean;
  relayHint?: string;
  /**
   * Forms attached to this event (Formstr).
   * Authors may attach one or more forms; participants are expected to
   * fill them when adding the event to their calendar.
   * Currently only persisted for private events.
   */
  forms?: IFormAttachment[];
}
