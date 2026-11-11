"use client";

import { MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { spokenSummary } from "@/lib/spoken-summary";
import { cn } from "@/lib/utils";

/**
 * Voice uses the browser's own speech recognition and speech synthesis (the Web Speech API):
 * no server route, no API key, English only. Recognition works in Chrome and Edge.
 */

/** Only this much of a reply is read aloud; tables and the assumptions block stay on screen. */
const MAX_SPOKEN_CHARS = 600;

const NOTICE = {
  denied: "Microphone access was denied. Allow it in the browser to ask by voice.",
  empty: "Didn't catch that. Try again.",
  unsupported: "This browser does not support speech recognition. Try Chrome or Edge.",
} as const;

/** The parts of the Web Speech API recognizer this module uses; not in TypeScript's DOM types. */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function browserRecognizer(): (new () => SpeechRecognitionLike) | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * The composer's microphone. One press starts listening, the next stops it and hands the
 * transcript to `onTranscript`. Problems are reported through `onNotice`; nothing is sent
 * when there is no transcript.
 */
export function MicButton({
  className,
  disabled,
  onNotice,
  onTranscript,
}: {
  readonly className?: string;
  readonly disabled: boolean;
  readonly onNotice: (notice: string | undefined) => void;
  readonly onTranscript: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const recognizer = useRef<SpeechRecognitionLike>(undefined);

  // Release the microphone if the chat unmounts mid-recording.
  useEffect(() => () => recognizer.current?.stop(), []);

  const start = () => {
    const Recognizer = browserRecognizer();
    if (Recognizer === undefined) {
      onNotice(NOTICE.unsupported);
      return;
    }
    let transcript = "";
    let problem: string | undefined;
    const active = new Recognizer();
    active.lang = "en-US";
    active.interimResults = false;
    active.onresult = (event) => {
      transcript = Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ");
    };
    active.onerror = (event) => {
      problem = event.error === "not-allowed" ? NOTICE.denied : NOTICE.empty;
    };
    active.onend = () => {
      recognizer.current = undefined;
      setRecording(false);
      if (transcript.trim().length > 0) onTranscript(transcript.trim());
      else onNotice(problem ?? NOTICE.empty);
    };
    recognizer.current = active;
    active.start();
    setRecording(true);
  };

  const toggle = () => {
    onNotice(undefined);
    if (recording) recognizer.current?.stop();
    else start();
  };

  return (
    <PromptInputButton
      aria-label={recording ? "Stop recording" : "Ask by voice"}
      aria-pressed={recording}
      className={cn(recording && "text-destructive", className)}
      disabled={disabled}
      onClick={toggle}
      variant="outline"
    >
      {recording ? <SquareIcon className="size-3 fill-current" /> : <MicIcon className="size-4" />}
    </PromptInputButton>
  );
}

/**
 * Reads assistant replies aloud, one at a time. `speakingId` is the id passed to the
 * `speak` call that is currently playing, so a message can show a Stop button.
 */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string>();

  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(undefined);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    (id: string, markdown: string) => {
      stop();
      const text = spokenSummary(markdown, MAX_SPOKEN_CHARS);
      if (text.length === 0 || !("speechSynthesis" in window)) return;

      const done = () => setSpeakingId((current) => (current === id ? undefined : current));
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.onend = done;
      utterance.onerror = done;
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [stop],
  );

  return { speak, speakingId, stop };
}
