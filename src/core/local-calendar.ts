// src/core/local-calendar.ts
// Agenda local stocké dans data/calendar.json — pas de dépendance Google.
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const CALENDAR_PATH = path.join(process.cwd(), 'data', 'calendar.json');

export interface LocalEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  created: string;
  updated: string;
}

function formatEvent(ev: LocalEvent): string {
  const startRaw = ev.start.dateTime || ev.start.date || '?';
  const endRaw   = ev.end.dateTime   || ev.end.date   || '?';
  const isAllDay = !ev.start.dateTime;
  const start = new Date(startRaw);
  const end   = new Date(endRaw);

  const dateStr = isAllDay
    ? start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  let out = `📅 ${ev.summary}\n   🕐 ${dateStr}`;
  if (ev.location)    out += `\n   📍 ${ev.location}`;
  if (ev.description) out += `\n   📝 ${ev.description.substring(0, 100)}`;
  out += `\n   🆔 ${ev.id}`;
  return out;
}

function toDateTime(s: string): { dateTime?: string; date?: string } {
  return s.includes('T') ? { dateTime: s } : { date: s };
}

export class LocalCalendarClient {
  private events: LocalEvent[] = [];
  private loaded = false;
  private saveLock: Promise<void> = Promise.resolve();

  async initialize(): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(CALENDAR_PATH), { recursive: true });
      const raw = await fs.readFile(CALENDAR_PATH, 'utf-8');
      this.events = JSON.parse(raw);
    } catch {
      this.events = [];
      await this.save();
    }
    this.loaded = true;
    console.log(`✅ Agenda local chargé (${this.events.length} événement(s))`);
    return true;
  }

  isReady(): boolean { return this.loaded; }
  credentialsExist(): boolean { return true; }

  private async save(): Promise<void> {
    const snapshot = JSON.stringify(this.events, null, 2);
    this.saveLock = this.saveLock
      .catch(() => {}) // absorbe les erreurs de la sauvegarde précédente
      .then(() => fs.writeFile(CALENDAR_PATH, snapshot, 'utf-8'));
    await this.saveLock;
  }

  async getEvents(maxResults = 10, timeMin?: string, timeMax?: string): Promise<{ events: LocalEvent[]; formatted: string }> {
    let filtered = [...this.events];

    if (timeMin) {
      const min = new Date(timeMin);
      filtered = filtered.filter(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date || 0);
        return d >= min;
      });
    }
    if (timeMax) {
      const max = new Date(timeMax);
      filtered = filtered.filter(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date || 0);
        return d < max;
      });
    }

    // Tri chronologique
    filtered.sort((a, b) => {
      const da = new Date(a.start.dateTime || a.start.date || 0).getTime();
      const db = new Date(b.start.dateTime || b.start.date || 0).getTime();
      return da - db;
    });

    filtered = filtered.slice(0, maxResults);
    const formatted = filtered.length === 0
      ? 'Aucun événement trouvé.'
      : filtered.map(formatEvent).join('\n\n');
    return { events: filtered, formatted };
  }

  async searchEvents(query: string, maxResults = 10): Promise<{ events: LocalEvent[]; formatted: string }> {
    const q = query.toLowerCase();
    const matches = this.events
      .filter(ev =>
        q === '' ||
        ev.summary.toLowerCase().includes(q) ||
        ev.description?.toLowerCase().includes(q) ||
        ev.location?.toLowerCase().includes(q)
      )
      .slice(0, maxResults);

    const formatted = matches.length === 0
      ? `Aucun événement trouvé pour "${query}".`
      : matches.map(formatEvent).join('\n\n');
    return { events: matches, formatted };
  }

  async createEvent(
    summary: string, start: string, end: string,
    description?: string, location?: string
  ): Promise<{ event: LocalEvent; formatted: string }> {
    const now = new Date().toISOString();
    const ev: LocalEvent = {
      id: randomUUID(),
      summary,
      description,
      location,
      start: toDateTime(start),
      end: toDateTime(end),
      created: now,
      updated: now
    };
    this.events.push(ev);
    await this.save();
    return { event: ev, formatted: `✅ Événement créé !\n${formatEvent(ev)}` };
  }

  async updateEvent(
    eventId: string,
    updates: { summary?: string; start?: string; end?: string; description?: string; location?: string }
  ): Promise<{ event: LocalEvent; formatted: string }> {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error(`Événement [${eventId}] introuvable.`);

    const ev = this.events[idx];
    if (updates.summary     !== undefined) ev.summary     = updates.summary;
    if (updates.description !== undefined) ev.description = updates.description;
    if (updates.location    !== undefined) ev.location    = updates.location;
    if (updates.start       !== undefined) ev.start       = toDateTime(updates.start);
    if (updates.end         !== undefined) ev.end         = toDateTime(updates.end);
    ev.updated = new Date().toISOString();

    await this.save();
    return { event: ev, formatted: `✅ Événement mis à jour !\n${formatEvent(ev)}` };
  }

  async deleteEvent(eventId: string): Promise<string> {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error(`Événement [${eventId}] introuvable.`);
    this.events.splice(idx, 1);
    await this.save();
    return `✅ Événement [${eventId}] supprimé.`;
  }
}
