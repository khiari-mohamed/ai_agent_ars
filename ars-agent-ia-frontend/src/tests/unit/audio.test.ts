import { describe, expect, it } from 'vitest';
import { isMp3, pcm16ToFloat32, pcmSampleRate } from '@/lib/audio/player';
import { rmsLevel, speechThreshold } from '@/lib/audio/recorder';

describe('player helpers', () => {
  it('detects formats', () => {
    expect(isMp3('mp3')).toBe(true);
    expect(isMp3('MP3_44100_128')).toBe(true);
    expect(isMp3('pcm_24000')).toBe(false);
    expect(pcmSampleRate('pcm_24000')).toBe(24000);
    expect(pcmSampleRate('PCM_16000')).toBe(16000);
    expect(pcmSampleRate('mp3')).toBeNull();
    expect(pcmSampleRate('pcm_0')).toBeNull();
  });

  it('converts little-endian pcm16 to floats and ignores a trailing odd byte', () => {
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setInt16(0, 0, true);
    view.setInt16(2, 16384, true);
    view.setInt16(4, -32768, true);
    const out = pcm16ToFloat32(buffer);
    expect(out.length).toBe(3);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBe(-1);
  });
});

describe('recorder helpers', () => {
  it('computes rms', () => {
    expect(rmsLevel([])).toBe(0);
    expect(rmsLevel([0, 0, 0])).toBe(0);
    expect(rmsLevel([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5, 5);
  });

  it('clamps the speech threshold', () => {
    expect(speechThreshold(0)).toBe(0.02);
    expect(speechThreshold(0.016)).toBeCloseTo(0.04, 5);
    expect(speechThreshold(1)).toBe(0.08);
  });
});
