/**
 * Voice settings. Model ids are Vercel AI Gateway ids; change them here only.
 * Prices in the comments are Gateway list prices on 2026-11-11.
 */
export const voiceConfig = {
  /** Speech-to-text: $0.000061 per second of audio. */
  sttModel: "elevenlabs/scribe-v2",
  /** Text-to-speech, low-latency conversational variant: $0.00004 per character. */
  ttsModel: "elevenlabs/eleven-v4-turbo",
  /** Used once if the first model rejects the request. Same price. */
  ttsFallbackModel: "elevenlabs/eleven-flash-v2.5",
  /** ElevenLabs voice id ("Bella"). */
  voiceId: "hpp4J3VqNfWAUOO0d1Us",
  /** Only this much of a reply is read aloud; it bounds the cost of a voice turn. */
  maxSpokenChars: 600,
  /** About five minutes of compressed speech; longer recordings are refused. */
  maxAudioBytes: 5_000_000,
} as const;
