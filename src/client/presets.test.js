import { describe, test, expect, beforeEach } from 'bun:test';

// Mock localStorage first
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

// Minimal stubs to allow import
globalThis.document = { getElementById: () => null, querySelector: () => null };

const { savePreset, getPresets, deletePreset } = await import('./presets.js');

// Access the real appState after import so we can mutate it
const stateModule = await import('./state.js');
const appState = stateModule.appState;
appState.filterType = 'Review';
appState.filterStatus = 'active';
appState.searchQuery = 'p:0';
appState.sortColumn = 'priority';
appState.sortDirection = 'asc';

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

describe('savePreset', () => {
  test('saves a preset with current state', () => {
    const p = savePreset('My Reviews');
    expect(p.name).toBe('My Reviews');
    expect(p.filterType).toBe('Review');
    expect(p.filterStatus).toBe('active');
    expect(p.searchQuery).toBe('p:0');
  });

  test('adds to the presets list', () => {
    savePreset('First');
    savePreset('Second');
    expect(getPresets()).toHaveLength(2);
  });

  test('replaces preset with same name', () => {
    savePreset('Dupe');
    savePreset('Dupe');
    expect(getPresets()).toHaveLength(1);
  });

  test('most recent is first', () => {
    savePreset('Old');
    savePreset('New');
    expect(getPresets()[0].name).toBe('New');
  });

  test('caps at 12 presets', () => {
    for (let i = 0; i < 15; i++) savePreset(`Preset ${i}`);
    expect(getPresets()).toHaveLength(12);
  });

  test('trims whitespace from name', () => {
    const p = savePreset('  My Filter  ');
    expect(p.name).toBe('My Filter');
  });
});

describe('deletePreset', () => {
  test('removes a preset by id', () => {
    const p = savePreset('ToDelete');
    deletePreset(p.id);
    expect(getPresets()).toHaveLength(0);
  });

  test('ignores unknown id', () => {
    savePreset('Keep');
    deletePreset('nonexistent');
    expect(getPresets()).toHaveLength(1);
  });
});

describe('getPresets', () => {
  test('returns empty array initially', () => {
    expect(getPresets()).toEqual([]);
  });

  test('handles corrupted storage', () => {
    store['todo-filter-presets'] = 'bad json';
    expect(getPresets()).toEqual([]);
  });
});
