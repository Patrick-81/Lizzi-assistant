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
      .map(t => `- ${t.name}: ${t.description}`)
      .join('\n');
    return `\n### OUTILS DISPONIBLES
${tools}

### RÈGLE D'UTILISATION DES OUTILS (OBLIGATOIRE)
Quand l'utilisateur demande quelque chose qui nécessite un outil, tu DOIS répondre UNIQUEMENT avec ce JSON, sans aucun autre texte avant ou après :
{"tool":"nom_outil","params":{"clé":"valeur",...}}

### QUAND UTILISER QUEL OUTIL
- AGENDA (rendez-vous, événements, repas, réunions, rappels datés) → outil "calendar"
- MÉMOIRE (préférences, faits permanents sur l'utilisateur, goûts, infos perso) → outil "manage_memory"

RÈGLE CRITIQUE : Toute demande contenant une DATE ou une HEURE = outil "calendar", jamais "manage_memory".

Exemples :
- "enregistre un repas de famille demain à 12h" → {"tool":"calendar","params":{"operation":"create_event","summary":"Repas de famille au restaurant de Técou","start":"2026-02-27T12:00:00","end":"2026-02-27T14:00:00"}}
- "crée un rendez-vous lundi à 9h" → {"tool":"calendar","params":{"operation":"create_event","summary":"Rendez-vous","start":"2026-03-02T09:00:00","end":"2026-03-02T10:00:00"}}
- "montre mon agenda" → {"tool":"calendar","params":{"operation":"show_calendar"}}
- "qu'est-ce que j'ai prévu ce mois-ci ?" → {"tool":"calendar","params":{"operation":"show_calendar"}}
- "affiche mon calendrier de mars" → {"tool":"calendar","params":{"operation":"show_calendar","month":3}}
- "liste mes souvenirs" → {"tool":"manage_memory","params":{"operation":"list"}}

NE DIS PAS "C'est noté !" ou "Je me souviendrai" pour un événement daté. Crée-le dans l'agenda avec le JSON.
NE DIS PAS "Un instant !" ou "Je vais chercher...". Réponds directement avec le JSON.`;
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

  setCalendarContext(calendarClient: LocalCalendarClient) {
    this.tools.set('calendar', {
      name: 'calendar',
      description: 'Gère l\'agenda Google Calendar : consulte, crée, modifie et supprime des événements. Opérations : get_events, search_events, create_event, update_event, delete_event, show_calendar (affiche la vue mensuelle).',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['get_events', 'search_events', 'create_event', 'update_event', 'delete_event', 'show_calendar'],
            description: 'Opération à effectuer. Utilise show_calendar pour afficher la page agenda du mois.'
          },
          year: {
            type: 'number',
            description: 'Année (pour show_calendar, défaut: année courante)'
          },
          month: {
            type: 'number',
            description: 'Mois 1-12 (pour show_calendar, défaut: mois courant)'
          },
          max_results: {
            type: 'number',
            description: 'Nombre maximum d\'événements à retourner (défaut: 10)'
          },
          time_min: {
            type: 'string',
            description: 'Date de début ISO 8601 pour filtrer les événements (ex: 2026-02-26T00:00:00+01:00)'
          },
          time_max: {
            type: 'string',
            description: 'Date de fin ISO 8601 pour filtrer les événements'
          },
          query: {
            type: 'string',
            description: 'Texte de recherche (pour search_events)'
          },
          event_id: {
            type: 'string',
            description: 'Identifiant de l\'événement (pour update_event et delete_event)'
          },
          summary: {
            type: 'string',
            description: 'Titre de l\'événement (pour create_event et update_event)'
          },
          start: {
            type: 'string',
            description: 'Date/heure de début ISO 8601 (ex: 2026-03-01T14:00:00 pour une heure précise, ou 2026-03-01 pour toute la journée)'
          },
          end: {
            type: 'string',
            description: 'Date/heure de fin ISO 8601'
          },
          description: {
            type: 'string',
            description: 'Description de l\'événement (optionnel)'
          },
          location: {
            type: 'string',
            description: 'Lieu de l\'événement (optionnel)'
          }
        },
        required: ['operation']
      },
      execute: async (params) => {
        if (!calendarClient.isReady()) {
          return {
            success: false,
            error: calendarClient.credentialsExist()
              ? 'Google Calendar non authentifié. Visite /auth/google pour autoriser l\'accès.'
              : 'Google Calendar non configuré. Place le fichier credentials.json dans data/.'
          };
        }

        try {
          const { operation, max_results, time_min, time_max, query, event_id, summary, start, end, description, location } = params;
          const year: number = params.year || new Date().getFullYear();
          const month: number = params.month || (new Date().getMonth() + 1);

          switch (operation) {
            case 'show_calendar': {
              const tMin = new Date(year, month - 1, 1).toISOString();
              const tMax = new Date(year, month, 1).toISOString();
              const result = await calendarClient.getEvents(100, tMin, tMax);
              const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
              return {
                success: true,
                showCalendar: { year, month },
                count: result.events.length,
                formatted: `J'ouvre ton agenda de ${monthName}. Tu y trouveras ${result.events.length} événement(s).`
              };
            }

            case 'get_events': {
              const result = await calendarClient.getEvents(max_results || 10, time_min, time_max);
              return { success: true, count: result.events.length, formatted: result.formatted };
            }

            case 'search_events': {
              if (!query) return { success: false, error: 'Le paramètre "query" est requis pour search_events.' };
              const result = await calendarClient.searchEvents(query, max_results || 10);
              return { success: true, count: result.events.length, formatted: result.formatted };
            }

            case 'create_event': {
              if (!summary || !start || !end) {
                return { success: false, error: 'Les paramètres "summary", "start" et "end" sont requis pour create_event.' };
              }
              const result = await calendarClient.createEvent(summary, start, end, description, location);
              return { success: true, formatted: result.formatted };
            }

            case 'update_event': {
              if (!event_id) return { success: false, error: 'Le paramètre "event_id" est requis pour update_event.' };
              const result = await calendarClient.updateEvent(event_id, { summary, start, end, description, location });
              return { success: true, formatted: result.formatted };
            }

            case 'delete_event': {
              if (!event_id) return { success: false, error: 'Le paramètre "event_id" est requis pour delete_event.' };
              const msg = await calendarClient.deleteEvent(event_id);
              return { success: true, formatted: msg };
            }

            default:
              return { success: false, error: `Opération "${operation}" non reconnue.` };
          }
        } catch (error: any) {
          return { success: false, error: `Erreur Calendar : ${error.message}` };
        }
      }
    });
  }
}
