import { describe, it, expect } from 'vitest';
import {
  formatDuration, scoreToPercent, truncate,
  sentimentBgColor, statusLabel, channelLabel,
} from '@/lib/utils';

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s');
  });
  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });
  it('handles 0', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('scoreToPercent', () => {
  it('converts -1 to 0%', () => {
    expect(scoreToPercent(-1)).toBe(0);
  });
  it('converts 0 to 50%', () => {
    expect(scoreToPercent(0)).toBe(50);
  });
  it('converts 1 to 100%', () => {
    expect(scoreToPercent(1)).toBe(100);
  });
});

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('truncates long strings with ellipsis', () => {
    const result = truncate('hello world', 7);
    expect(result.length).toBe(7);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('sentimentBgColor', () => {
  it('returns green classes for SATISFAIT', () => {
    expect(sentimentBgColor('SATISFAIT')).toContain('sage');
  });
  it('returns red classes for INSATISFAIT', () => {
    expect(sentimentBgColor('INSATISFAIT')).toContain('red');
  });
});

describe('statusLabel', () => {
  it('maps ACTIVE to Active', () => {
    expect(statusLabel('ACTIVE')).toBe('Active');
  });
  it('maps ESCALATED to Escaladée', () => {
    expect(statusLabel('ESCALATED')).toBe('Escaladée');
  });
});

describe('channelLabel', () => {
  it('maps CHAT_WEB', () => {
    expect(channelLabel('CHAT_WEB')).toBe('Chat Web');
  });
  it('maps VOIP', () => {
    expect(channelLabel('VOIP')).toBe('Téléphone');
  });
});