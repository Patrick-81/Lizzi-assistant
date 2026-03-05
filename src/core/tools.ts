// src/core/tools.ts
import * as math from 'mathjs';
import type { LongTermMemory } from './long-term-memory.js';
import type { LocalCalendarClient } from './local-calendar.js';

export interface MemoryContext {
  longTermMemory: LongTermMemory;
  embeddingClient: any;
  embeddingModel: string;
}

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8006';

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<any>;
}

export class ToolSystem {
  private tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map();
    this.registerTools();
  }

  private registerTools() {
    // Outil de recherche web via SearXNG
    this.tools.set('web_search', {
      name: 'web_search',
      description: 'Effectue une recherche sur internet via SearXNG et retourne les résultats les plus pertinents.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La requête de recherche'
          },
          max_results: {
            type: 'number',
            description: 'Nombre maximum de résultats à retourner (défaut: 5)'
          }
        },
        required: ['query']
      },
      execute: async (params) => {
        try {
          const maxResults = params.max_results || 5;
          const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(params.query)}&format=json&language=fr`;

          const response = await fetch(url);
          if (!response.ok) {
            return { success: false, error: `SearXNG a répondu avec le statut ${response.status}` };
          }

          const data: any = await response.json();
          const results = (data.results || []).slice(0, maxResults).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content
          }));

          return {
            success: true,
            query: params.query,
            results,
            formatted: results.map((r: any, i: number) =>
              `${i + 1}. **${r.title}**\n   ${r.content}\n   🔗 ${r.url}`
            ).join('\n\n')
          };
        } catch (error: any) {
          return { success: false, error: `Erreur de recherche : ${error.message}` };
        }
      }
    });

    // Outil de calcul mathématique
    this.tools.set('calculate', {
      name: 'calculate',
      description: 'Évalue une expression mathématique. Supporte les opérations de base, fonctions trigonométriques, logarithmes, puissances, etc.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Expression mathématique à évaluer (ex: "2 + 2", "sqrt(16)", "sin(pi/2)")'
          }
        },
        required: ['expression']
      },
      execute: async (params) => {
        try {
          const result = math.evaluate(params.expression);
          return {
            success: true,
            result: result,
            formatted: typeof result === 'number' ? result.toLocaleString('fr-FR') : result.toString()
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erreur de calcul : ${error.message}`
          };
        }
      }
    });

    // Outil de manipulation de dates
    this.tools.set('date_operations', {
      name: 'date_operations',
      description: 'Effectue des opérations sur les dates : différence entre dates, ajout/soustraction de jours, formatage, etc.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['diff', 'add', 'subtract', 'format', 'parse', 'now'],
            description: 'Type d\'opération à effectuer'
          },
          date1: {
            type: 'string',
            description: 'Première date (format ISO ou texte)'
          },
          date2: {
            type: 'string',
            description: 'Deuxième date pour les comparaisons'
          },
          amount: {
            type: 'number',
            description: 'Nombre de jours/mois/années à ajouter/soustraire'
          },
          unit: {
            type: 'string',
            enum: ['days', 'months', 'years', 'hours', 'minutes'],
            description: 'Unité de temps'
          },
          format: {
            type: 'string',
            description: 'Format de sortie souhaité'
          }
        },
        required: ['operation']
      },
      execute: async (params) => {
        try {
          const { operation, date1, date2, amount, unit, format } = params;

          switch (operation) {
            case 'now': {
              const now = new Date();
              return {
                success: true,
                result: now.toISOString(),
                formatted: now.toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'medium'
                })
              };
            }

            case 'diff': {
              const d1 = new Date(date1);
              const d2 = new Date(date2);
              const diffMs = Math.abs(d2.getTime() - d1.getTime());
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffMinutes = Math.floor(diffMs / (1000 * 60));

              return {
                success: true,
                result: {
                  milliseconds: diffMs,
                  minutes: diffMinutes,
                  hours: diffHours,
                  days: diffDays,
                  weeks: Math.floor(diffDays / 7),
                  months: Math.floor(diffDays / 30.44),
                  years: Math.floor(diffDays / 365.25)
                },
                formatted: `${diffDays} jour(s), soit environ ${Math.floor(diffDays / 7)} semaine(s)`
              };
            }

            case 'add': {
              const d = new Date(date1);
              switch (unit) {
                case 'days':
                  d.setDate(d.getDate() + amount);
                  break;
                case 'months':
                  d.setMonth(d.getMonth() + amount);
                  break;
                case 'years':
                  d.setFullYear(d.getFullYear() + amount);
                  break;
                case 'hours':
                  d.setHours(d.getHours() + amount);
                  break;
                case 'minutes':
                  d.setMinutes(d.getMinutes() + amount);
                  break;
              }
              return {
                success: true,
                result: d.toISOString(),
                formatted: d.toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'short'
                })
              };
            }

            case 'subtract': {
              const d = new Date(date1);
              switch (unit) {
                case 'days':
                  d.setDate(d.getDate() - amount);
                  break;
                case 'months':
                  d.setMonth(d.getMonth() - amount);
                  break;
                case 'years':
                  d.setFullYear(d.getFullYear() - amount);
                  break;
                case 'hours':
                  d.setHours(d.getHours() - amount);
                  break;
                case 'minutes':
                  d.setMinutes(d.getMinutes() - amount);
                  break;
              }
              return {
                success: true,
                result: d.toISOString(),
                formatted: d.toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'short'
                })
              };
            }

            case 'format': {
              const d = new Date(date1);
              return {
                success: true,
                result: d.toISOString(),
                formatted: d.toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'medium'
                }),
                variants: {
                  short: d.toLocaleDateString('fr-FR'),
                  long: d.toLocaleDateString('fr-FR', { dateStyle: 'full' }),
                  time: d.toLocaleTimeString('fr-FR'),
                  iso: d.toISOString()
                }
              };
            }

            case 'parse': {
              const d = new Date(date1);
              if (isNaN(d.getTime())) {
                return {
                  success: false,
                  error: 'Date invalide'
                };
              }
              return {
                success: true,
                result: d.toISOString(),
                formatted: d.toLocaleString('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'medium'
                }),
                components: {
                  year: d.getFullYear(),
                  month: d.getMonth() + 1,
                  day: d.getDate(),
                  hours: d.getHours(),
                  minutes: d.getMinutes(),
                  dayOfWeek: d.toLocaleDateString('fr-FR', { weekday: 'long' })
                }
              };
            }

            default:
              return {
                success: false,
                error: 'Opération non reconnue'
              };
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Erreur de date : ${error.message}`
          };
        }
      }
    });

    // Outil de conversion d'unités
    this.tools.set('convert_units', {
      name: 'convert_units',
      description: 'Convertit des valeurs entre différentes unités (longueur, poids, température, etc.)',
      parameters: {
        type: 'object',
        properties: {
          value: {
            type: 'number',
            description: 'Valeur à convertir'
          },
          from: {
            type: 'string',
            description: 'Unité de départ'
          },
          to: {
            type: 'string',
            description: 'Unité d\'arrivée'
          }
        },
        required: ['value', 'from', 'to']
      },
      execute: async (params) => {
        try {
          const result = math.unit(params.value, params.from).toNumber(params.to);
          return {
            success: true,
            result: result,
            formatted: `${params.value} ${params.from} = ${result.toLocaleString('fr-FR')} ${params.to}`
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Erreur de conversion : ${error.message}`
          };
        }
      }
    });
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Outil "${name}" non trouvé`
      };
    }

    return await tool.execute(params);
  }

  getToolDescriptions(): string {
    const tools = Array.from(this.tools.values())
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');
    return `\n### OUTILS DISPONIBLES
${tools}

### PROTOCOLE D'APPEL D'OUTIL (OBLIGATOIRE)
Quand tu dois utiliser un outil, réponds UNIQUEMENT avec ce JSON (rien d'autre) :
{"tool":"nom_outil","params":{"clé":"valeur",...}}

### GESTION AUTONOME DE L'AGENDA

**CONSULTATION** — Pour TOUTE question sur l'agenda : appelle agenda_list EN PREMIER, sans exception.
Pour une date précise :
{"tool":"agenda_list","params":{"date_min":"2026-03-19T00:00:00","date_max":"2026-03-19T23:59:59"}}
Pour un mois entier :
{"tool":"agenda_list","params":{"date_min":"2026-03-01T00:00:00","date_max":"2026-03-31T23:59:59"}}

**AJOUT** — si date, heure ou libellé manquant, demande-les. Quand tu as tout :
{"tool":"agenda_create","params":{"summary":"Rendez-vous médecin","start":"2026-03-05T14:00:00"}}

**SUPPRESSION** :
1. agenda_list pour obtenir les événements et leurs IDs
2. Présente la liste numérotée : "1. Titre — date heure (id: uuid)"
3. L'utilisateur indique les numéros ou titres à supprimer
4. Demande confirmation courte
5. Après confirmation explicite, supprime TOUT en une seule fois avec event_ids :
   - Un seul : {"tool":"agenda_delete","params":{"event_id":"uuid-ici"}}
   - Plusieurs : {"tool":"agenda_delete","params":{"event_ids":["uuid-1","uuid-2","uuid-3"]}}

**MODIFICATION** :
1. agenda_list pour obtenir l'ID de l'événement
2. {"tool":"agenda_update","params":{"event_id":"uuid-ici","start":"2026-03-05T15:00:00"}}

**DUPLICATION** — Copier un événement à une autre date EN CONSERVANT le libellé et l'heure :
1. agenda_list sur la date de l'événement source pour récupérer son summary, start ET end exacts
2. Calcule la nouvelle date en gardant EXACTEMENT la même heure (HH:MM:SS)
3. {"tool":"agenda_create","params":{"summary":"<même titre>","start":"<nouvelle_date>T<même_heure>","end":"<nouvelle_date>T<même_heure_fin>"}}
INTERDIT de créer l'événement sans avoir d'abord appelé agenda_list pour connaître l'heure exacte.

**RÈGLES CRITIQUES :**
- INTERDIT de répondre à une question sur l'agenda sans avoir appelé un outil
- JAMAIS appeler agenda_delete sans confirmation explicite de l'utilisateur
- Si agenda_create retourne { conflict: true } : montre les événements en conflit à l'utilisateur et demande confirmation. Si l'utilisateur confirme, rappelle agenda_create avec "force": true. Ne crée jamais deux événements à la même heure sans confirmation.
- MÉMOIRE (préférences, faits permanents) → manage_memory, pas agenda_*
- Toute demande contenant une DATE ou une HEURE → agenda_*, jamais manage_memory`;
  }

  setMemoryContext(ctx: MemoryContext) {
    const { longTermMemory, embeddingClient, embeddingModel } = ctx;

    this.tools.set('manage_memory', {
      name: 'manage_memory',
      description: 'Gère la mémoire long terme : liste, cherche, supprime ou met à jour des souvenirs. Opérations : list, search, delete, update, summarize.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['list', 'search', 'delete', 'update', 'summarize'],
            description: 'Opération à effectuer'
          },
          query: {
            type: 'string',
            description: 'Texte de recherche (pour search)'
          },
          id: {
            type: 'string',
            description: 'Identifiant du souvenir (pour delete et update)'
          },
          subject: {
            type: 'string',
            description: 'Sujet du fait (pour update)'
          },
          predicate: {
            type: 'string',
            description: 'Prédicat du fait (pour update)'
          },
          objects: {
            type: 'array',
            items: { type: 'string' },
            description: 'Valeurs du fait (pour update)'
          }
        },
        required: ['operation']
      },
      execute: async (params) => {
        const { operation, query, id, subject, predicate, objects } = params;

        switch (operation) {
          case 'list': {
            const facts = await longTermMemory.getAll();
            if (facts.length === 0) {
              return { success: true, count: 0, formatted: 'Aucun souvenir en mémoire.' };
            }
            const formatted = facts.map(f =>
              `[${f.id}] ${f.subject} ${f.predicate} : ${f.objects.join(', ')}`
            ).join('\n');
            return { success: true, count: facts.length, facts, formatted };
          }

          case 'search': {
            if (!query) return { success: false, error: 'Le paramètre "query" est requis pour search.' };
            const vector = await longTermMemory.generateEmbedding(query);
            const results = await longTermMemory.vectorSearch(vector, 0.3);
            if (results.length === 0) {
              return { success: true, count: 0, formatted: `Aucun souvenir trouvé pour "${query}".` };
            }
            const formatted = results.map(f =>
              `[${f.id}] ${f.subject} ${f.predicate} : ${f.objects.join(', ')}`
            ).join('\n');
            return { success: true, count: results.length, facts: results, formatted };
          }

          case 'delete': {
            if (!id) return { success: false, error: 'Le paramètre "id" est requis pour delete.' };
            const deleted = await longTermMemory.delete(id);
            return {
              success: deleted,
              formatted: deleted
                ? `✅ Souvenir [${id}] supprimé avec succès.`
                : `❌ Souvenir [${id}] introuvable.`
            };
          }

          case 'update': {
            if (!id || !predicate || !objects || !subject) {
              return { success: false, error: 'Les paramètres "id", "subject", "predicate" et "objects" sont requis pour update.' };
            }
            const updated = await longTermMemory.update(id, predicate, objects, subject);
            return {
              success: !!updated,
              formatted: updated
                ? `✅ Souvenir [${id}] mis à jour : ${subject} ${predicate} ${objects.join(', ')}.`
                : `❌ Souvenir [${id}] introuvable.`
            };
          }

          case 'summarize': {
            const facts = await longTermMemory.getAll();
            const bySubject: Record<string, number> = {};
            const byPredicate: Record<string, number> = {};
            for (const f of facts) {
              bySubject[f.subject] = (bySubject[f.subject] || 0) + 1;
              byPredicate[f.predicate] = (byPredicate[f.predicate] || 0) + 1;
            }
            const subjectSummary = Object.entries(bySubject)
              .sort((a, b) => b[1] - a[1])
              .map(([s, n]) => `${s} (${n} fait${n > 1 ? 's' : ''})`)
              .join(', ');
            const formatted = `📊 Mémoire long terme : ${facts.length} souvenir${facts.length > 1 ? 's' : ''} au total.\nSujets : ${subjectSummary || 'aucun'}.`;
            return { success: true, count: facts.length, bySubject, byPredicate, formatted };
          }

          default:
            return { success: false, error: `Opération "${operation}" non reconnue.` };
        }
      }
    });
  }

  setCalendarContext(calendarClient: LocalCalendarClient, embeddingFn?: (text: string) => Promise<number[]>) {

    // ── agenda_list ───────────────────────────────────────────────────────────
    this.tools.set('agenda_list', {
      name: 'agenda_list',
      description: 'Liste les événements de l\'agenda dans une plage de dates. Retourne les événements avec leurs IDs.',
      parameters: {
        type: 'object',
        properties: {
          date_min: { type: 'string', description: 'Date de début ISO 8601 (ex: 2026-03-01T00:00:00)' },
          date_max: { type: 'string', description: 'Date de fin ISO 8601 (ex: 2026-03-31T23:59:59)' },
          max_results: { type: 'number', description: 'Nombre maximum de résultats (défaut: 20)' }
        },
        required: []
      },
      execute: async (params) => {
        try {
          const result = await calendarClient.getEvents(params.max_results || 20, params.date_min, params.date_max);
          const events = result.events.map((ev: any) => ({
            id: ev.id,
            summary: ev.summary,
            start: ev.start.dateTime || ev.start.date,
            end: ev.end.dateTime || ev.end.date,
            location: ev.location,
            description: ev.description
          }));
          return { success: true, count: events.length, events, formatted: result.formatted };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    });

    // ── agenda_search ─────────────────────────────────────────────────────────
    this.tools.set('agenda_search', {
      name: 'agenda_search',
      description: 'Recherche sémantique dans l\'agenda par texte libre. Utilise la similarité vectorielle pour trouver les événements même avec des synonymes. Retourne les événements avec leurs IDs. À utiliser AVANT agenda_delete ou agenda_update pour trouver l\'event_id.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texte de recherche libre (ex: "médecin", "réunion équipe", "repas famille")' },
          date_min: { type: 'string', description: 'Filtrer après cette date ISO 8601 (optionnel)' },
          date_max: { type: 'string', description: 'Filtrer avant cette date ISO 8601 (optionnel)' }
        },
        required: ['query']
      },
      execute: async (params) => {
        try {
          let events: any[] = [];

          // Recherche vectorielle si embedding disponible
          if (embeddingFn) {
            const queryVector = await embeddingFn(params.query);
            const vectorResults = await calendarClient.vectorSearch(queryVector, 0.3);
            events = vectorResults;
          }

          // Fallback texte si vectoriel donne rien
          if (events.length === 0) {
            const textResult = await calendarClient.searchEvents(params.query, 20);
            events = textResult.events as any[];
          }

          // Filtrage par date optionnel
          if (params.date_min || params.date_max) {
            const min = params.date_min ? new Date(params.date_min) : null;
            const max = params.date_max ? new Date(params.date_max) : null;
            events = events.filter((ev: any) => {
              const d = new Date(ev.start.dateTime || ev.start.date || 0);
              if (min && d < min) return false;
              if (max && d > max) return false;
              return true;
            });
          }

          const formatted = events.slice(0, 10).map((ev: any, i: number) => {
            const d = new Date(ev.start.dateTime || ev.start.date || 0);
            const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const timeStr = ev.start.dateTime ? ` à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '';
            return `${i + 1}. [id:${ev.id}] ${ev.summary} — ${dateStr}${timeStr}`;
          }).join('\n');

          return {
            success: true,
            count: events.length,
            events: events.slice(0, 10).map((ev: any) => ({
              id: ev.id, summary: ev.summary,
              start: ev.start.dateTime || ev.start.date
            })),
            formatted: events.length === 0
              ? `Aucun événement trouvé pour "${params.query}".`
              : formatted
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    });

    // ── agenda_create ─────────────────────────────────────────────────────────
    this.tools.set('agenda_create', {
      name: 'agenda_create',
      description: 'Crée un nouvel événement dans l\'agenda. Tous les champs date/heure doivent être au format ISO 8601.',
      parameters: {
        type: 'object',
        properties: {
          summary:     { type: 'string', description: 'Titre / libellé de l\'événement' },
          start:       { type: 'string', description: 'Début ISO 8601 (ex: 2026-03-05T14:00:00)' },
          end:         { type: 'string', description: 'Fin ISO 8601 (ex: 2026-03-05T15:00:00). Si absent, défaut = start + 1h.' },
          description: { type: 'string', description: 'Description (optionnel)' },
          location:    { type: 'string', description: 'Lieu (optionnel)' },
          force:       { type: 'boolean', description: 'Si true, crée même si un autre événement existe déjà à cette heure (après confirmation utilisateur).' }
        },
        required: ['summary', 'start']
      },
      execute: async (params) => {
        try {
          let end = params.end;
          if (!end) {
            const d = new Date(params.start);
            d.setHours(d.getHours() + 1);
            end = d.toISOString().slice(0, 19);
          }
          const result = await calendarClient.createEvent(
            params.summary, params.start, end, params.description, params.location, params.force === true
          );
          if ('conflict' in result) {
            return { success: false, conflict: true, conflicting: result.conflicting };
          }
          const d = new Date(params.start);
          return {
            success: true,
            event_id: result.event.id,
            formatted: result.formatted,
            showCalendar: { year: d.getFullYear(), month: d.getMonth() + 1 }
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    });

    // ── agenda_update ─────────────────────────────────────────────────────────
    this.tools.set('agenda_update', {
      name: 'agenda_update',
      description: 'Modifie un événement existant par son ID. Utilise agenda_search pour obtenir l\'event_id avant d\'appeler cet outil.',
      parameters: {
        type: 'object',
        properties: {
          event_id:    { type: 'string', description: 'ID de l\'événement (obtenu via agenda_search)' },
          summary:     { type: 'string', description: 'Nouveau titre (optionnel)' },
          start:       { type: 'string', description: 'Nouvelle date/heure de début ISO 8601 (optionnel)' },
          end:         { type: 'string', description: 'Nouvelle date/heure de fin ISO 8601 (optionnel)' },
          description: { type: 'string', description: 'Nouvelle description (optionnel)' },
          location:    { type: 'string', description: 'Nouveau lieu (optionnel)' }
        },
        required: ['event_id']
      },
      execute: async (params) => {
        try {
          const { event_id, ...updates } = params;
          const result = await calendarClient.updateEvent(event_id, updates);
          const d = new Date(updates.start || result.event?.start?.dateTime || new Date());
          return {
            success: true,
            formatted: result.formatted,
            showCalendar: { year: d.getFullYear(), month: d.getMonth() + 1 }
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    });

    // ── agenda_delete ─────────────────────────────────────────────────────────
    this.tools.set('agenda_delete', {
      name: 'agenda_delete',
      description: 'Supprime un ou plusieurs événements par leur(s) ID. Utilise agenda_search pour obtenir les event_id. Demande TOUJOURS confirmation à l\'utilisateur avant d\'appeler cet outil. Pour supprimer plusieurs événements en une fois, utilise event_ids (tableau).',
      parameters: {
        type: 'object',
        properties: {
          event_id:  { type: 'string', description: 'ID d\'un seul événement à supprimer' },
          event_ids: { type: 'array', items: { type: 'string' }, description: 'Liste d\'IDs d\'événements à supprimer en une seule opération (préféré pour les suppressions multiples)' }
        }
      },
      execute: async (params) => {
        try {
          const now = new Date();
          const calAction = { year: now.getFullYear(), month: now.getMonth() + 1 };

          // Batch delete (event_ids array)
          if (Array.isArray(params.event_ids) && params.event_ids.length > 0) {
            const { deleted, notFound } = await calendarClient.deleteEvents(params.event_ids);
            const lines = [
              deleted.length  > 0 ? `✅ ${deleted.length} événement(s) supprimé(s).` : '',
              notFound.length > 0 ? `⚠️ ${notFound.length} ID(s) introuvable(s) : ${notFound.join(', ')}` : ''
            ].filter(Boolean).join('\n');
            return { success: true, formatted: lines, showCalendar: calAction };
          }

          // Single delete (event_id string)
          if (params.event_id) {
            const msg = await calendarClient.deleteEvent(params.event_id);
            return { success: true, formatted: msg, showCalendar: calAction };
          }

          return { success: false, error: 'Paramètre "event_id" ou "event_ids" requis.' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    });

    // ── show_calendar (UI) ────────────────────────────────────────────────────
    this.tools.set('show_calendar', {
      name: 'show_calendar',
      description: 'Affiche la vue graphique mensuelle de l\'agenda dans l\'interface. À utiliser quand l\'utilisateur demande à voir/afficher son agenda.',
      parameters: {
        type: 'object',
        properties: {
          year:  { type: 'number', description: 'Année (défaut: année courante)' },
          month: { type: 'number', description: 'Mois 1-12 (défaut: mois courant)' }
        },
        required: []
      },
      execute: async (params) => {
        const year  = params.year  || new Date().getFullYear();
        const month = params.month || (new Date().getMonth() + 1);
        const tMin = new Date(year, month - 1, 1).toISOString();
        const tMax = new Date(year, month, 1).toISOString();
        const result = await calendarClient.getEvents(100, tMin, tMax);
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        return {
          success: true,
          showCalendar: { year, month },
          count: result.events.length,
          // formatted contient le détail complet pour que le LLM s'en souvienne
          formatted: result.formatted
        };
      }
    });
  }
}
