"use client";

import { LoaderCircleIcon, MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { spokenSummary } from "@/lib/spoken-summary";
import { voiceConfig } from "@/lib/voice-config";
import { cn } from "@/lib/utils";

/**
 * Voice goes through the server (ElevenLabs via the AI Gateway) until a route answers
 * `fallback: "browser"`. From then on, for the life of the page, the browser's own speech
 * recognition and voice are used instead, so one failed request doesn't break voice.
 */
const fallback = { speechToText: false, textToSpeech: false };

const NOTICE = {
  denied: "Microphone access was denied. Allow it in the browser to ask by voice.",
  empty: "Didn't catch that. Try again.",
  failed: "Speech-to-text failed. Check the connection and try again.",
  switchedToBrowser:
    "Server speech-to-text is unavailable, so the browser's speech recognition is used instead. Press the microphone again.",
  unsupported: "This browser cannot record audio.",
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

async function readJson(response: Response): Promise<{ error?: string; fallback?: string; text?: string }> {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    fallback?: string;
    text?: string;
  };
}

/**
 * The composer's microphone. One press starts recording, the next stops it and hands the
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
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorder = useRef<MediaRecorder>(undefined);
  const recognizer = useRef<SpeechRecognitionLike>(undefined);

  // Release the microphone if the chat unmounts mid-recording.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
      recognizer.current?.stop();
    },
    [],
  );

  const transcribeRecording = async (recording: Blob) => {
    setState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", recording, recording.type.includes("mp4") ? "question.mp4" : "question.webm");
      const response = await fetch("/api/voice/transcribe", { body: form, method: "POST" });
      const body = await readJson(response);

      if (response.ok) {
        const text = body.text?.trim() ?? "";
        if (text.length > 0) onTranscript(text);
        else onNotice(NOTICE.empty);
      } else if (body.fallback === "browser" && browserRecognizer() !== undefined) {
        fallback.speechToText = true;
        onNotice(NOTICE.switchedToBrowser);
      } else {
        onNotice(body.error ?? NOTICE.failed);
      }
    } catch {
      onNotice(NOTICE.failed);
    } finally {
      setState("idle");
    }
  };

  const startRecording = async () => {
    if (navigator.mediaDevices?.getUserMedia === undefined || typeof MediaRecorder === "undefined") {
      onNotice(NOTICE.unsupported);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onNotice(NOTICE.denied);
      return;
    }

    const chunks: Blob[] = [];
    const active = new MediaRecorder(stream);
    active.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    active.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = undefined;
      void transcribeRecording(new Blob(chunks, { type: active.mimeType }));
    };
    recorder.current = active;
    active.start();
    setState("recording");
  };

  const startBrowserRecognition = () => {
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
      setState("idle");
      if (transcript.trim().length > 0) onTranscript(transcript.trim());
      else onNotice(problem ?? NOTICE.empty);
    };
    recognizer.current = active;
    active.start();
    setState("recording");
  };

  const toggle = () => {
    if (state === "recording") {
      recorder.current?.stop();
      recognizer.current?.stop();
      return;
    }
    onNotice(undefined);
    if (fallback.speechToText) startBrowserRecognition();
    else void startRecording();
  };

  return (
    <PromptInputButton
      aria-label={state === "recording" ? "Stop recording" : "Ask by voice"}
      aria-pressed={state === "recording"}
      className={cn(state === "recording" && "text-destructive", className)}
      disabled={disabled || state === "transcribing"}
      onClick={toggle}
      variant="outline"
    >
      {state === "recording" ? (
        <SquareIcon className="size-3 fill-current" />
      ) : state === "transcribing" ? (
        <LoaderCircleIcon className="size-4 animate-spin" />
      ) : (
        <MicIcon className="size-4" />
      )}
    </PromptInputButton>
  );
}

/**
 * Reads assistant replies aloud, one at a time. `speakingId` is the id passed to the
 * `speak` call that is currently playing, so a message can show a Stop button.
 */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string>();
  const audio = useRef<HTMLAudioElement>(undefined);

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = undefined;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(undefined);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (id: string, markdown: string) => {
      stop();
      setSpeakingId(id);
      const done = () => setSpeakingId((current) => (current === id ? undefined : current));

      try {
        if (!fallback.textToSpeech) {
          const response = await fetch("/api/voice/speak", {
            body: JSON.stringify({ text: markdown }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          if (response.ok) {
            const url = URL.createObjectURL(await response.blob());
            const player = new Audio(url);
            const finish = () => {
              URL.revokeObjectURL(url);
              done();
            };
            player.onended = finish;
            player.onerror = finish;
            audio.current = player;
            await player.play();
            return;
          }
          if ((await readJson(response)).fallback !== "browser") {
            done(); // Nothing to read aloud.
            return;
          }
          fallback.textToSpeech = true;
        }

        const text = spokenSummary(markdown, voiceConfig.maxSpokenChars);
        if (text.length === 0 || !("speechSynthesis" in window)) {
          done();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.onend = done;
        utterance.onerror = done;
        window.speechSynthesis.speak(utterance);
      } catch {
        // The network failed, or the browser blocked playback that no click started.
        done();
      }
    },
    [stop],
  );

  return { speak, speakingId, stop };
}
