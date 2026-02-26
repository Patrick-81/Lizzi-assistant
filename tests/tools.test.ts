import { describe, it, expect } from 'vitest';
import { ToolSystem } from '../src/core/tools.js';

const tools = new ToolSystem();

describe('Outil calculate', () => {
  it('additionne deux nombres', async () => {
    const result = await tools.executeTool('calculate', { expression: '2 + 2' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(4);
  });

  it('calcule une racine carrée', async () => {
    const result = await tools.executeTool('calculate', { expression: 'sqrt(144)' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(12);
  });

  it('calcule une puissance', async () => {
    const result = await tools.executeTool('calculate', { expression: '2^10' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(1024);
  });

  it('retourne une erreur pour une expression invalide', async () => {
    const result = await tools.executeTool('calculate', { expression: 'abc + ?' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Outil convert_units', () => {
  it('convertit km en miles', async () => {
    const result = await tools.executeTool('convert_units', { value: 100, from: 'km', to: 'mile' });
    expect(result.success).toBe(true);
    expect(result.result).toBeCloseTo(62.137, 2);
  });

  it('convertit kg en livres', async () => {
    const result = await tools.executeTool('convert_units', { value: 1, from: 'kg', to: 'lb' });
    expect(result.success).toBe(true);
    expect(result.result).toBeCloseTo(2.2046, 2);
  });

  it('convertit celsius en fahrenheit', async () => {
    const result = await tools.executeTool('convert_units', { value: 100, from: 'celsius', to: 'fahrenheit' });
    expect(result.success).toBe(true);
    expect(result.result).toBeCloseTo(212, 0);
  });
});

describe('Outil date_operations', () => {
  it('retourne la date actuelle avec "now"', async () => {
    const result = await tools.executeTool('date_operations', { operation: 'now' });
    expect(result.success).toBe(true);
    expect(result.result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('calcule la différence entre deux dates', async () => {
    const result = await tools.executeTool('date_operations', {
      operation: 'diff',
      date1: '2024-01-01',
      date2: '2024-01-08'
    });
    expect(result.success).toBe(true);
    expect(result.result.days).toBe(7);
    expect(result.result.weeks).toBe(1);
  });

  it('ajoute des jours à une date', async () => {
    const result = await tools.executeTool('date_operations', {
      operation: 'add',
      date1: '2024-01-01',
      amount: 10,
      unit: 'days'
    });
    expect(result.success).toBe(true);
    expect(result.result).toContain('2024-01-11');
  });
});
