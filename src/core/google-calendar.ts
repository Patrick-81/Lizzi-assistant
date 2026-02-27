// src/core/google-calendar.ts
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { promises as fs } from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'data', 'google-tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'data', 'google-credentials.json');

function formatEvent(event: calendar_v3.Schema$Event): string {
  const start = event.start?.dateTime || event.start?.date || '?';
  const end = event.end?.dateTime || event.end?.date || '?';
  const startDate = new Date(start);
  const endDate = new Date(end);
  const isAllDay = !event.start?.dateTime;

  const dateStr = isAllDay
    ? startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  let formatted = `📅 ${event.summary || '(sans titre)'}\n   🕐 ${dateStr}`;
  if (event.location) formatted += `\n   📍 ${event.location}`;
  if (event.description) formatted += `\n   📝 ${event.description.substring(0, 100)}`;
  formatted += `\n   🆔 ${event.id}`;
  return formatted;
}

export class GoogleCalendarClient {
  private oauth2Client: OAuth2Client | null = null;
  private calendar: calendar_v3.Calendar | null = null;
  private redirectUri: string;

  constructor() {
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3001}/auth/google/callback`;
  }

  async initialize(): Promise<boolean> {
    try {
      const credContent = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
      const creds = JSON.parse(credContent);
      const { client_id, client_secret } = creds.web || creds.installed;

      this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, this.redirectUri);
    } catch {
      console.log('ℹ️  Google Calendar: data/google-credentials.json manquant, intégration désactivée.');
      return false;
    }

    try {
      const tokenContent = await fs.readFile(TOKEN_PATH, 'utf-8');
      const tokens = JSON.parse(tokenContent);
      this.oauth2Client.setCredentials(tokens);

      // Auto-rafraîchit et persiste les nouveaux tokens
      this.oauth2Client.on('tokens', async (newTokens) => {
        const merged = { ...tokens, ...newTokens };
        await fs.writeFile(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log('🔄 Tokens Google Calendar rafraîchis');
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      console.log('✅ Google Calendar connecté');
      return true;
    } catch {
      console.log('ℹ️  Google Calendar: authentification requise → GET /auth/google');
      return false;
    }
  }

  getAuthUrl(): string | null {
    if (!this.oauth2Client) return null;
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async handleCallback(code: string): Promise<boolean> {
    if (!this.oauth2Client) return false;
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      console.log('✅ Google Calendar authentifié');
      return true;
    } catch (error) {
      console.error('❌ Erreur échange code OAuth:', error);
      return false;
    }
  }

  isReady(): boolean {
    return this.calendar !== null;
  }

  credentialsExist(): boolean {
    return this.oauth2Client !== null;
  }

  // --- OPÉRATIONS CALENDAR ---

  async getEvents(maxResults = 10, timeMin?: string, timeMax?: string): Promise<{ events: any[]; formatted: string }> {
    if (!this.calendar) throw new Error('Google Calendar non authentifié');
    const res = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });
    const events = res.data.items || [];
    const formatted = events.length === 0
      ? 'Aucun événement trouvé.'
      : events.map(formatEvent).join('\n\n');
    return { events, formatted };
  }

  async searchEvents(query: string, maxResults = 10): Promise<{ events: any[]; formatted: string }> {
    if (!this.calendar) throw new Error('Google Calendar non authentifié');
    const res = await this.calendar.events.list({
      calendarId: 'primary',
      q: query,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const events = res.data.items || [];
    const formatted = events.length === 0
      ? `Aucun événement trouvé pour "${query}".`
      : events.map(formatEvent).join('\n\n');
    return { events, formatted };
  }

  async createEvent(
    summary: string, start: string, end: string,
    description?: string, location?: string
  ): Promise<{ event: any; formatted: string }> {
    if (!this.calendar) throw new Error('Google Calendar non authentifié');
    const toDateTime = (s: string) =>
      s.includes('T') ? { dateTime: s, timeZone: 'Europe/Paris' } : { date: s };

    const requestBody: calendar_v3.Schema$Event = { summary, description, location, start: toDateTime(start), end: toDateTime(end) };
    const res = await this.calendar.events.insert({ calendarId: 'primary', requestBody });
    return {
      event: res.data,
      formatted: `✅ Événement créé !\n${formatEvent(res.data)}`
    };
  }

  async updateEvent(
    eventId: string,
    updates: { summary?: string; start?: string; end?: string; description?: string; location?: string }
  ): Promise<{ event: any; formatted: string }> {
    if (!this.calendar) throw new Error('Google Calendar non authentifié');
    const existing = await this.calendar.events.get({ calendarId: 'primary', eventId });
    const event = existing.data;

    if (updates.summary) event.summary = updates.summary;
    if (updates.description !== undefined) event.description = updates.description;
    if (updates.location !== undefined) event.location = updates.location;
    if (updates.start) event.start = updates.start.includes('T') ? { dateTime: updates.start, timeZone: 'Europe/Paris' } : { date: updates.start };
    if (updates.end) event.end = updates.end.includes('T') ? { dateTime: updates.end, timeZone: 'Europe/Paris' } : { date: updates.end };

    const res = await this.calendar.events.update({ calendarId: 'primary', eventId, requestBody: event });
    return {
      event: res.data,
      formatted: `✅ Événement mis à jour !\n${formatEvent(res.data)}`
    };
  }

  async deleteEvent(eventId: string): Promise<string> {
    if (!this.calendar) throw new Error('Google Calendar non authentifié');
    await this.calendar.events.delete({ calendarId: 'primary', eventId });
    return `✅ Événement [${eventId}] supprimé.`;
  }
}
