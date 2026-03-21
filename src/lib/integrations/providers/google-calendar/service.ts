import "server-only";

import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";

export type CalendarEntry = {
  id: string;
  summary: string;
  description: string;
  timeZone: string;
  primary: boolean;
  backgroundColor: string;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  startTimeZone: string;
  endTimeZone: string;
  isAllDay: boolean;
  status: string;
  htmlLink: string;
  hangoutLink: string;
  attendees: Array<{
    email: string;
    displayName: string;
    responseStatus: string;
    organizer: boolean;
  }>;
  organizer: { email: string; displayName: string };
  recurrence: string[];
  created: string;
  updated: string;
};

function parseEvent(
  event: calendar_v3.Schema$Event,
  calendarId: string,
): CalendarEvent {
  return {
    id: event.id ?? "",
    calendarId,
    summary: event.summary ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    startTimeZone: event.start?.timeZone ?? "",
    endTimeZone: event.end?.timeZone ?? "",
    isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
    status: event.status ?? "",
    htmlLink: event.htmlLink ?? "",
    hangoutLink: event.hangoutLink ?? "",
    attendees: (event.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      displayName: a.displayName ?? "",
      responseStatus: a.responseStatus ?? "needsAction",
      organizer: a.organizer ?? false,
    })),
    organizer: {
      email: event.organizer?.email ?? "",
      displayName: event.organizer?.displayName ?? "",
    },
    recurrence: event.recurrence ?? [],
    created: event.created ?? "",
    updated: event.updated ?? "",
  };
}

export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar;

  constructor(accessToken: string) {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async listCalendars(): Promise<CalendarEntry[]> {
    const response = await this.calendar.calendarList.list();
    return (response.data.items ?? []).map((cal) => ({
      id: cal.id ?? "",
      summary: cal.summary ?? "",
      description: cal.description ?? "",
      timeZone: cal.timeZone ?? "",
      primary: cal.primary ?? false,
      backgroundColor: cal.backgroundColor ?? "",
    }));
  }

  async getEvents(params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    query?: string;
    pageToken?: string;
  }): Promise<{ events: CalendarEvent[]; nextPageToken?: string }> {
    const calendarId = params.calendarId || "primary";

    const response = await this.calendar.events.list({
      calendarId,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults ?? 50,
      q: params.query,
      pageToken: params.pageToken,
      singleEvents: true,
      orderBy: "startTime",
    });

    return {
      events: (response.data.items ?? []).map((e) => parseEvent(e, calendarId)),
      nextPageToken: response.data.nextPageToken ?? undefined,
    };
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const response = await this.calendar.events.get({
      calendarId,
      eventId,
    });
    return parseEvent(response.data, calendarId);
  }

  async createEvent(params: {
    calendarId?: string;
    summary: string;
    description?: string;
    location?: string;
    startDateTime: string;
    endDateTime: string;
    timeZone?: string;
    attendees?: string[];
  }): Promise<CalendarEvent> {
    const calendarId = params.calendarId || "primary";

    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: {
        dateTime: params.startDateTime,
        timeZone: params.timeZone,
      },
      end: {
        dateTime: params.endDateTime,
        timeZone: params.timeZone,
      },
      attendees: params.attendees?.map((email) => ({ email })),
    };

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return parseEvent(response.data, calendarId);
  }

  async updateEvent(params: {
    calendarId?: string;
    eventId: string;
    summary?: string;
    description?: string;
    location?: string;
    startDateTime?: string;
    endDateTime?: string;
    timeZone?: string;
    attendees?: string[];
  }): Promise<CalendarEvent> {
    const calendarId = params.calendarId || "primary";

    const event: calendar_v3.Schema$Event = {
      ...(params.summary !== undefined ? { summary: params.summary } : {}),
      ...(params.description !== undefined
        ? { description: params.description }
        : {}),
      ...(params.location !== undefined ? { location: params.location } : {}),
      ...(params.startDateTime
        ? {
            start: {
              dateTime: params.startDateTime,
              timeZone: params.timeZone,
            },
          }
        : {}),
      ...(params.endDateTime
        ? { end: { dateTime: params.endDateTime, timeZone: params.timeZone } }
        : {}),
      ...(params.attendees
        ? { attendees: params.attendees.map((email) => ({ email })) }
        : {}),
    };

    const response = await this.calendar.events.patch({
      calendarId,
      eventId: params.eventId,
      requestBody: event,
    });

    return parseEvent(response.data, calendarId);
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
  ): Promise<{ deleted: boolean }> {
    await this.calendar.events.delete({ calendarId, eventId });
    return { deleted: true };
  }

  async getFreeBusy(params: {
    timeMin: string;
    timeMax: string;
    calendarIds?: string[];
  }): Promise<
    Array<{
      calendarId: string;
      busy: Array<{ start: string; end: string }>;
    }>
  > {
    const calendars = (params.calendarIds ?? ["primary"]).map((id) => ({
      id,
    }));

    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        items: calendars,
      },
    });

    const result: Array<{
      calendarId: string;
      busy: Array<{ start: string; end: string }>;
    }> = [];

    for (const [calId, info] of Object.entries(response.data.calendars ?? {})) {
      result.push({
        calendarId: calId,
        busy: (info.busy ?? []).map((b) => ({
          start: b.start ?? "",
          end: b.end ?? "",
        })),
      });
    }

    return result;
  }

  async quickAdd(calendarId: string, text: string): Promise<CalendarEvent> {
    const response = await this.calendar.events.quickAdd({
      calendarId: calendarId || "primary",
      text,
    });
    return parseEvent(response.data, calendarId || "primary");
  }

  async rsvpEvent(
    calendarId: string,
    eventId: string,
    responseStatus: "accepted" | "declined" | "tentative",
  ): Promise<CalendarEvent> {
    const existing = await this.getEvent(calendarId, eventId);

    const updatedAttendees = existing.attendees.map((a) => ({
      email: a.email,
      responseStatus:
        a.email === existing.organizer.email
          ? a.responseStatus
          : a.responseStatus,
    }));

    const response = await this.calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        attendees:
          updatedAttendees.length > 0
            ? updatedAttendees.map((a) => ({
                email: a.email,
                responseStatus: a.responseStatus,
              }))
            : undefined,
      },
      sendUpdates: "all",
    });

    const selfEntry = response.data.attendees?.find((a) => a.self === true);
    if (selfEntry) {
      selfEntry.responseStatus = responseStatus;
      await this.calendar.events.patch({
        calendarId,
        eventId,
        requestBody: {
          attendees: response.data.attendees,
        },
        sendUpdates: "all",
      });
    }

    const updated = await this.getEvent(calendarId, eventId);
    return updated;
  }

  async moveEvent(
    calendarId: string,
    eventId: string,
    destinationCalendarId: string,
  ): Promise<CalendarEvent> {
    const response = await this.calendar.events.move({
      calendarId,
      eventId,
      destination: destinationCalendarId,
    });
    return parseEvent(response.data, destinationCalendarId);
  }
}
