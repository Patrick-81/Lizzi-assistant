// src/core/tools.ts
import * as math from 'mathjs';

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
    let descriptions = "OUTILS DISPONIBLES :\n\n";

    for (const tool of this.tools.values()) {
      descriptions += `**${tool.name}** : ${tool.description}\n`;
    }

    descriptions += "\nPour utiliser un outil, tu dois ABSOLUMENT répondre avec un JSON valide dans ce format exact :\n";
    descriptions += '```json\n{"tool": "nom_outil", "params": {...}}\n```\n\n';
    descriptions += "Si tu as besoin d'utiliser un outil, réponds UNIQUEMENT avec le JSON, rien d'autre.\n";
    descriptions += "Sinon, réponds normalement en texte.\n";

    return descriptions;
  }
}
