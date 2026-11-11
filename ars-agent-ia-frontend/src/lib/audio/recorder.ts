import { STRINGS } from '@/lib/strings';
import type { AudioInputFormat } from '@/lib/ws/protocol';
import { audioContextCtor } from '@/lib/audio/player';

export type RecorderErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'failed';
export type StopReason = 'manual' | 'silence' | 'max_duration' | 'no_speech' | 'cancelled';
export type DiscardReason = 'too_short' | 'no_speech' | 'cancelled';

export class RecorderError extends Error {
  readonly code: RecorderErrorCode;
  constructor(code: RecorderErrorCode) {
    super(code);
    this.name = 'RecorderError';
    this.code = code;
  }
}

export function recorderErrorMessage(error: unknown): string {
  const code: RecorderErrorCode = error instanceof RecorderError ? error.code : 'failed';
  return STRINGS.recorder[code];
}

export interface RecordingResult {
  blob: Blob;
  format: AudioInputFormat;
  reason: Exclude<StopReason, 'no_speech' | 'cancelled'>;
}

export interface RecorderHandlers {
  onLevel: (level: number, speaking: boolean) => void;
  onComplete: (result: RecordingResult) => void;
  onDiscard: (reason: DiscardReason) => void;
  onError: (error: RecorderError) => void;
}

const TICK_MS = 50;
const CALIBRATION_MS = 400;
const MIN_UTTERANCE_MS = 400;
const SILENCE_MS = 1400;
const MAX_UTTERANCE_MS = 55_000;
const NO_SPEECH_MS = 8_000;
const FLOOR_FACTOR = 2.5;
const MIN_THRESHOLD = 0.02;
const MAX_THRESHOLD = 0.08;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

export function speechThreshold(noiseFloor: number): number {
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, noiseFloor * FLOOR_FACTOR));
}

function formatFor(mimeType: string): AudioInputFormat {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'mp4';
  return 'container';
}

function pickMime(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function classify(error: unknown): RecorderError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError('denied');
  if (name === 'NotFoundError' || name === 'OverflowError') return new RecorderError('unavailable');
  return new RecorderError('failed');
}

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  audioContext: AudioContext;
  chunks: Blob[];
  timer: number;
  startedAt: number;
  finishing: boolean;
}

/** One MediaRecorder per utterance, with silence detection to auto-stop. */
export class UtteranceRecorder {
  private readonly handlers: RecorderHandlers;
  private session: Session | null = null;
  private starting = false;
  private abortStart = false;

  constructor(handlers: RecorderHandlers) {
    this.handlers = handlers;
  }

  get isRecording(): boolean {
    return this.session !== null || this.starting;
  }

  async start(): Promise<void> {
    if (this.isRecording) return;
    const AudioCtor = audioContextCtor();
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined' ||
      !AudioCtor
    ) {
      throw new RecorderError('unsupported');
    }
    this.starting = true;
    this.abortStart = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      this.starting = false;
      throw classify(error);
    }
    if (this.abortStart) {
      stream.getTracks().forEach((t) => t.stop());
      this.starting = false;
      return;
    }
    try {
      this.begin(stream, AudioCtor);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      throw new RecorderError('failed');
    } finally {
      this.starting = false;
    }
  }

  /** Ends the utterance and sends it (ignored if shorter than 400 ms). */
  stop(): void {
    this.finish('manual');
  }

  /** Ends the utterance and drops it. */
  cancel(): void {
    if (this.starting) this.abortStart = true;
    this.finish('cancelled');
  }

  private begin(stream: MediaStream, AudioCtor: typeof AudioContext): void {
    const mime = pickMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const audioContext = new AudioCtor();
    void audioContext.resume().catch(() => undefined);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const startedAt = performance.now();
    let noiseFloor = Number.POSITIVE_INFINITY;
    let speechHeard = false;
    let lastVoiceAt = startedAt;

    const session: Session = {
      stream,
      recorder,
      audioContext,
      chunks: [],
      timer: 0,
      startedAt,
      finishing: false,
    };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };
    recorder.onerror = () => {
      this.teardown(session);
      this.handlers.onError(new RecorderError('failed'));
    };

    session.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const level = rmsLevel(samples);
      const now = performance.now();
      const elapsed = now - startedAt;
      if (elapsed < CALIBRATION_MS) noiseFloor = Math.min(noiseFloor, level);
      const floor = Number.isFinite(noiseFloor) ? noiseFloor : level;
      const speaking = elapsed >= CALIBRATION_MS && level > speechThreshold(floor);
      if (speaking) {
        speechHeard = true;
        lastVoiceAt = now;
      }
      this.handlers.onLevel(level, speaking);
      if (elapsed >= MAX_UTTERANCE_MS) this.finish('max_duration');
      else if (speechHeard && now - lastVoiceAt >= SILENCE_MS) this.finish('silence');
      else if (!speechHeard && elapsed >= NO_SPEECH_MS) this.finish('no_speech');
    }, TICK_MS);

    this.session = session;
    recorder.start();
  }

  private finish(reason: StopReason): void {
    const session = this.session;
    if (!session || session.finishing) return;
    session.finishing = true;
    window.clearInterval(session.timer);
    const elapsed = performance.now() - session.startedAt;

    const complete = (): void => {
      const mimeType = session.recorder.mimeType;
      const blob = new Blob(session.chunks, { type: mimeType });
      this.teardown(session);
      if (reason === 'cancelled') {
        this.handlers.onDiscard('cancelled');
      } else if (reason === 'no_speech') {
        this.handlers.onDiscard('no_speech');
      } else if (elapsed < MIN_UTTERANCE_MS || blob.size === 0) {
        this.handlers.onDiscard('too_short');
      } else {
        this.handlers.onComplete({ blob, format: formatFor(mimeType), reason });
      }
    };

    if (session.recorder.state === 'inactive') {
      complete();
    } else {
      session.recorder.onstop = complete;
      try {
        session.recorder.stop();
      } catch {
        complete();
      }
    }
  }

  private teardown(session: Session): void {
    window.clearInterval(session.timer);
    session.recorder.ondataavailable = null;
    session.recorder.onerror = null;
    session.recorder.onstop = null;
    session.stream.getTracks().forEach((t) => t.stop());
    void session.audioContext.close().catch(() => undefined);
    if (this.session === session) this.session = null;
  }
}