import { tool } from "ai";
import { z } from "zod";

import type { IntegrationContext } from "../../types";
import { GoogleCalendarService } from "./service";

function getCalendarService(context: IntegrationContext): GoogleCalendarService {
  const token = context.tokens.google_calendar;
  if (!token) {
    throw new Error("Google Calendar is not connected. Connect it in Settings > Integrations.");
  }
  return new GoogleCalendarService(token);
}

export function buildGoogleCalendarTools(context: IntegrationContext, approvalFn: (toolName: string) => boolean) {
  return {
    gcal_list_calendars: tool({
      description: "List all calendars for the connected Google account.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        calendars: z.array(z.object({
          id: z.string(),
          summary: z.string(),
          description: z.string(),
          timeZone: z.string(),
          primary: z.boolean(),
          backgroundColor: z.string(),
        })),
      }),
      needsApproval: () => approvalFn("gcal_list_calendars"),
      execute: async () => {
        const service = getCalendarService(context);
        const calendars = await service.listCalendars();
        return { calendars };
      },
    }),

    gcal_get_events: tool({
      description: "Get calendar events within a date range. Returns events sorted by start time.",
      inputSchema: z.object({
        calendarId: z.string().optional().describe("Calendar ID (defaults to 'primary')."),
        timeMin: z.string().describe("Start of the date range in ISO 8601 format (e.g. '2025-01-01T00:00:00Z')."),
        timeMax: z.string().describe("End of the date range in ISO 8601 format."),
        maxResults: z.number().min(1).max(100).default(25).describe("Maximum number of events."),
        query: z.string().optional().describe("Free text search term for events."),
      }),
      outputSchema: z.object({
        events: z.array(z.object({
          id: z.string(),
          calendarId: z.string(),
          summary: z.string(),
          description: z.string(),
          location: z.string(),
          start: z.string(),
          end: z.string(),
          isAllDay: z.boolean(),
          status: z.string(),
          htmlLink: z.string(),
          hangoutLink: z.string(),
          attendeeCount: z.number(),
          organizer: z.object({ email: z.string(), displayName: z.string() }),
        })),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("gcal_get_events"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          totalResults: output.totalResults,
          events: output.events.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start,
            end: e.end,
            isAllDay: e.isAllDay,
            location: e.location,
            attendeeCount: e.attendeeCount,
          })),
        },
      }),
      execute: async (input) => {
        const service = getCalendarService(context);
        const result = await service.getEvents(input);
        return {
          events: result.events.map((e) => ({
            id: e.id,
            calendarId: e.calendarId,
            summary: e.summary,
            description: e.description,
            location: e.location,
            start: e.start,
            end: e.end,
            isAllDay: e.isAllDay,
            status: e.status,
            htmlLink: e.htmlLink,
            hangoutLink: e.hangoutLink,
            attendeeCount: e.attendees.length,
            organizer: e.organizer,
          })),
          totalResults: result.events.length,
        };
      },
    }),

    gcal_get_event: tool({
      description: "Get detailed information about a single calendar event.",
      inputSchema: z.object({
        calendarId: z.string().describe("Calendar ID containing the event."),
        eventId: z.string().describe("The event ID to retrieve."),
      }),
      outputSchema: z.object({
        id: z.string(),
        calendarId: z.string(),
        summary: z.string(),
        description: z.string(),
        location: z.string(),
        start: z.string(),
        end: z.string(),
        startTimeZone: z.string(),
        endTimeZone: z.string(),
        isAllDay: z.boolean(),
        status: z.string(),
        htmlLink: z.string(),
        hangoutLink: z.string(),
        attendees: z.array(z.object({
          email: z.string(),
          displayName: z.string(),
          responseStatus: z.string(),
          organizer: z.boolean(),
        })),
        organizer: z.object({ email: z.string(), displayName: z.string() }),
        recurrence: z.array(z.string()),
      }),
      needsApproval: () => approvalFn("gcal_get_event"),
      execute: async (input) => {
        const service = getCalendarService(context);
        return service.getEvent(input.calendarId, input.eventId);
      },
    }),

    gcal_create_event: tool({
      description: "Create a new calendar event.",
      inputSchema: z.object({
        calendarId: z.string().optional().describe("Calendar ID (defaults to 'primary')."),
        summary: z.string().describe("Event title."),
        description: z.string().optional().describe("Event description."),
        location: z.string().optional().describe("Event location."),
        startDateTime: z.string().describe("Start date/time in ISO 8601 format."),
        endDateTime: z.string().describe("End date/time in ISO 8601 format."),
        timeZone: z.string().optional().describe("IANA time zone (e.g. 'America/New_York')."),
        attendees: z.array(z.string()).optional().describe("List of attendee email addresses."),
      }),
      outputSchema: z.object({
        id: z.string(),
        summary: z.string(),
        start: z.string(),
        end: z.string(),
        htmlLink: z.string(),
        status: z.literal("created"),
      }),
      needsApproval: () => approvalFn("gcal_create_event"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const event = await service.createEvent(input);
        return {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          htmlLink: event.htmlLink,
          status: "created" as const,
        };
      },
    }),

    gcal_update_event: tool({
      description: "Update an existing calendar event.",
      inputSchema: z.object({
        calendarId: z.string().optional().describe("Calendar ID (defaults to 'primary')."),
        eventId: z.string().describe("The event ID to update."),
        summary: z.string().optional().describe("New event title."),
        description: z.string().optional().describe("New event description."),
        location: z.string().optional().describe("New event location."),
        startDateTime: z.string().optional().describe("New start date/time in ISO 8601."),
        endDateTime: z.string().optional().describe("New end date/time in ISO 8601."),
        timeZone: z.string().optional().describe("IANA time zone."),
        attendees: z.array(z.string()).optional().describe("Updated attendee email list."),
      }),
      outputSchema: z.object({
        id: z.string(),
        summary: z.string(),
        start: z.string(),
        end: z.string(),
        htmlLink: z.string(),
        status: z.literal("updated"),
      }),
      needsApproval: () => approvalFn("gcal_update_event"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const event = await service.updateEvent(input);
        return {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          htmlLink: event.htmlLink,
          status: "updated" as const,
        };
      },
    }),

    gcal_delete_event: tool({
      description: "Delete a calendar event.",
      inputSchema: z.object({
        calendarId: z.string().describe("Calendar ID containing the event."),
        eventId: z.string().describe("The event ID to delete."),
      }),
      outputSchema: z.object({ status: z.literal("deleted") }),
      needsApproval: () => approvalFn("gcal_delete_event"),
      execute: async (input) => {
        const service = getCalendarService(context);
        await service.deleteEvent(input.calendarId, input.eventId);
        return { status: "deleted" as const };
      },
    }),

    gcal_get_free_busy: tool({
      description: "Check free/busy status for one or more calendars in a time range.",
      inputSchema: z.object({
        timeMin: z.string().describe("Start of the range in ISO 8601 format."),
        timeMax: z.string().describe("End of the range in ISO 8601 format."),
        calendarIds: z.array(z.string()).optional().describe("Calendar IDs to check (defaults to primary)."),
      }),
      outputSchema: z.object({
        calendars: z.array(z.object({
          calendarId: z.string(),
          busy: z.array(z.object({
            start: z.string(),
            end: z.string(),
          })),
        })),
      }),
      needsApproval: () => approvalFn("gcal_get_free_busy"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const result = await service.getFreeBusy(input);
        return { calendars: result };
      },
    }),

    gcal_quick_add: tool({
      description:
        "Create a calendar event from natural language text (e.g. 'Lunch with John tomorrow at noon', 'Meeting on Friday 3-4pm').",
      inputSchema: z.object({
        text: z.string().describe("Natural language description of the event."),
        calendarId: z.string().optional().describe("Calendar ID (defaults to 'primary')."),
      }),
      outputSchema: z.object({
        id: z.string(),
        summary: z.string(),
        start: z.string(),
        end: z.string(),
        htmlLink: z.string(),
        status: z.literal("created"),
      }),
      needsApproval: () => approvalFn("gcal_quick_add"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const event = await service.quickAdd(input.calendarId || "primary", input.text);
        return {
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          htmlLink: event.htmlLink,
          status: "created" as const,
        };
      },
    }),

    gcal_rsvp: tool({
      description:
        "Respond to a calendar event invitation. Accept, decline, or mark as tentative.",
      inputSchema: z.object({
        calendarId: z.string().describe("Calendar ID containing the event."),
        eventId: z.string().describe("The event ID to respond to."),
        status: z
          .enum(["accepted", "declined", "tentative"])
          .describe("Your response to the invitation."),
      }),
      outputSchema: z.object({
        id: z.string(),
        summary: z.string(),
        responseStatus: z.string(),
        status: z.literal("responded"),
      }),
      needsApproval: () => approvalFn("gcal_rsvp"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const event = await service.rsvpEvent(
          input.calendarId,
          input.eventId,
          input.status,
        );
        return {
          id: event.id,
          summary: event.summary,
          responseStatus: input.status,
          status: "responded" as const,
        };
      },
    }),

    gcal_move_event: tool({
      description: "Move a calendar event from one calendar to another.",
      inputSchema: z.object({
        calendarId: z.string().describe("Source calendar ID."),
        eventId: z.string().describe("The event ID to move."),
        destinationCalendarId: z.string().describe("Destination calendar ID."),
      }),
      outputSchema: z.object({
        id: z.string(),
        summary: z.string(),
        htmlLink: z.string(),
        status: z.literal("moved"),
      }),
      needsApproval: () => approvalFn("gcal_move_event"),
      execute: async (input) => {
        const service = getCalendarService(context);
        const event = await service.moveEvent(
          input.calendarId,
          input.eventId,
          input.destinationCalendarId,
        );
        return {
          id: event.id,
          summary: event.summary,
          htmlLink: event.htmlLink,
          status: "moved" as const,
        };
      },
    }),

    gcal_get_today: tool({
      description:
        "Get all calendar events for today. A convenience shortcut — no date range needed.",
      inputSchema: z.object({
        calendarId: z.string().optional().describe("Calendar ID (defaults to 'primary')."),
      }),
      outputSchema: z.object({
        events: z.array(z.object({
          id: z.string(),
          calendarId: z.string(),
          summary: z.string(),
          description: z.string(),
          location: z.string(),
          start: z.string(),
          end: z.string(),
          isAllDay: z.boolean(),
          status: z.string(),
          htmlLink: z.string(),
          hangoutLink: z.string(),
          attendeeCount: z.number(),
          organizer: z.object({ email: z.string(), displayName: z.string() }),
        })),
        totalResults: z.number(),
      }),
      needsApproval: () => approvalFn("gcal_get_today"),
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          totalResults: output.totalResults,
          events: output.events.map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start,
            end: e.end,
            isAllDay: e.isAllDay,
            location: e.location,
            attendeeCount: e.attendeeCount,
          })),
        },
      }),
      execute: async (input) => {
        const service = getCalendarService(context);
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        const result = await service.getEvents({
          calendarId: input.calendarId,
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          maxResults: 50,
        });

        return {
          events: result.events.map((e) => ({
            id: e.id,
            calendarId: e.calendarId,
            summary: e.summary,
            description: e.description,
            location: e.location,
            start: e.start,
            end: e.end,
            isAllDay: e.isAllDay,
            status: e.status,
            htmlLink: e.htmlLink,
            hangoutLink: e.hangoutLink,
            attendeeCount: e.attendees.length,
            organizer: e.organizer,
          })),
          totalResults: result.events.length,
        };
      },
    }),
  };
}
