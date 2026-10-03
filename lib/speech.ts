"use client";

/**
 * 包裝瀏覽器內建的 Web Speech API（SpeechSynthesis 朗讀 + SpeechRecognition
 * 語音辨識），不额外接 TTS/STT 的付費服務。瀏覽器支援度不是 100%——
 * SpeechRecognition 目前主要在 Chrome／Edge 系列瀏覽器可用，Safari/Firefox
 * 支援不完整，呼叫端要檢查 isSpeechRecognitionSupported() 並在不支援時
 * 顯示替代方案（例如改用文字輸入）。
 */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, onEnd?: () => void): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 1;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface Recognizer {
  start(): void;
  stop(): void;
}

export function createRecognizer(onResult: (transcript: string) => void, onEnd: () => void): Recognizer | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "zh-TW";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = Array.from({ length: event.results.length })
      .map((_, i) => event.results[i][0].transcript)
      .join("");
    onResult(transcript);
  };
  recognition.onend = onEnd;
  recognition.onerror = onEnd;

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
