export type PlayerState = 'idle' | 'playing' | 'blocked';
export type PlayerErrorKind = 'unsupported' | 'playback';

export interface PlayerHandlers {
  onState: (state: PlayerState) => void;
  onError: (kind: PlayerErrorKind) => void;
}

export function audioContextCtor(): typeof AudioContext | null {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function isMp3(format: string): boolean {
  return format.toLowerCase().startsWith('mp3');
}

/** 'pcm_24000' -> 24000, anything else -> null. */
export function pcmSampleRate(format: string): number | null {
  const match = /^pcm_(\d+)$/i.exec(format);
  const rate = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Little-endian signed 16-bit PCM -> float samples. A trailing odd byte is ignored. */
export function pcm16ToFloat32(bytes: ArrayBufferLike) {
  const view = new DataView(bytes);
  const count = bytes.byteLength >> 1;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function concat(chunks: ArrayBuffer[]): ArrayBuffer {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new ArrayBuffer(total);
  const view = new Uint8Array(out);
  let offset = 0;
  for (const c of chunks) {
    view.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }
  return out;
}

const START_LEAD_S = 0.02;

/**
 * Plays one TTS reply at a time. mp3 is buffered and decoded once on audio_end
 * (mp3 fragments are not independently decodable); pcm_N streams gaplessly.
 * If the browser blocks autoplay, scheduled audio waits and starts after unlock().
 */
export class VoicePlayer {
  private readonly handlers: PlayerHandlers;
  private ctx: AudioContext | null = null;
  private epoch = 0;
  private chain: Promise<void> = Promise.resolve();
  private mode: 'mp3' | 'pcm' | null = null;
  private sampleRate = 24000;
  private mp3Chunks: ArrayBuffer[] = [];
  private leftover: number | null = null;
  private nextStart = 0;
  private active = new Set<AudioBufferSourceNode>();
  private pending = 0;
  private streamEnded = true;
  private current: PlayerState = 'idle';

  constructor(handlers: PlayerHandlers) {
    this.handlers = handlers;
  }

  get state(): PlayerState {
    return this.current;
  }

  /** Call on audio_start. Returns false if the reply cannot be played. */
  begin(format: string): boolean {
    this.stop();
    const rate = pcmSampleRate(format);
    if (isMp3(format)) {
      this.mode = 'mp3';
    } else if (rate !== null) {
      this.mode = 'pcm';
      this.sampleRate = rate;
    } else {
      this.handlers.onError('unsupported');
      return false;
    }
    if (!this.getContext()) {
      this.mode = null;
      this.handlers.onError('unsupported');
      return false;
    }
    this.streamEnded = false;
    this.refresh();
    return true;
  }

  /** Call for each binary frame between audio_start and audio_end. */
  push(chunk: ArrayBuffer): void {
    if (this.mode === 'mp3') this.mp3Chunks.push(chunk);
    else if (this.mode === 'pcm') this.playPcm(chunk);
  }

  /** Call on audio_end. */
  end(): void {
    if (this.mode === null) return;
    this.streamEnded = true;
    if (this.mode === 'mp3') this.decodeMp3();
    this.refresh();
  }

  /** Must be called from a user gesture to lift an autoplay block. */
  async unlock(): Promise<void> {
    const ctx = this.getContext();
    if (ctx && ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // still blocked: state stays 'blocked'
      }
    }
    this.refresh();
  }

  /** Drops queued and playing audio (barge-in, new conversation). */
  stop(): void {
    this.epoch += 1;
    for (const source of this.active) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.active.clear();
    this.mp3Chunks = [];
    this.leftover = null;
    this.pending = 0;
    this.nextStart = 0;
    this.streamEnded = true;
    this.mode = null;
    this.refresh();
  }

  dispose(): void {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    }
  }

  private getContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      ctx.onstatechange = () => this.refresh();
      this.ctx = ctx;
      return ctx;
    } catch {
      return null;
    }
  }

  private refresh(): void {
    let next: PlayerState;
    if (this.active.size === 0 && this.pending === 0 && this.streamEnded) next = 'idle';
    else if (this.ctx && this.ctx.state !== 'running') next = 'blocked';
    else next = 'playing';
    if (next !== this.current) {
      this.current = next;
      this.handlers.onState(next);
    }
  }

  private decodeMp3(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const data = concat(this.mp3Chunks);
    this.mp3Chunks = [];
    if (data.byteLength === 0) return;
    const epoch = this.epoch;
    this.pending += 1;
    this.chain = this.chain.then(async () => {
      try {
        const decoded = await ctx.decodeAudioData(data);
        if (epoch === this.epoch) this.schedule(decoded);
      } catch {
        if (epoch === this.epoch) this.handlers.onError('playback');
      } finally {
        if (epoch === this.epoch) {
          this.pending -= 1;
          this.refresh();
        }
      }
    });
  }

  private playPcm(chunk: ArrayBuffer): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let data = chunk;
    if (this.leftover !== null) {
      const merged = new ArrayBuffer(chunk.byteLength + 1);
      const view = new Uint8Array(merged);
      view[0] = this.leftover;
      view.set(new Uint8Array(chunk), 1);
      data = merged;
      this.leftover = null;
    }
    if (data.byteLength % 2 === 1) this.leftover = new Uint8Array(data)[data.byteLength - 1] ?? null;
    const samples = pcm16ToFloat32(data);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.schedule(buffer);
  }

  private schedule(buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(this.nextStart, ctx.currentTime + START_LEAD_S);
    source.onended = () => {
      this.active.delete(source);
      this.refresh();
    };
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;
    this.active.add(source);
    this.refresh();
  }
}