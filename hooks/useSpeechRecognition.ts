/**
 * useSpeechRecognition — Wraps the Web Speech API (SpeechRecognition)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

function getSpeechRecognition(): (new () => any) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { lang, onFinalTranscript, onError } = options;

  const SpeechRecognition = getSpeechRecognition();
  const isSupported = SpeechRecognition !== null;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any | null>(null);
  const accumulatedRef = useRef('');

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    if (isListening) {
      stopListening();
      return;
    }

    accumulatedRef.current = '';
    setTranscript('');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang || navigator.language || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimText = '';
      let newFinal = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          newFinal += text + ' ';
        } else {
          interimText += text;
        }
      }

      if (newFinal) {
        accumulatedRef.current += newFinal;
        onFinalTranscript?.(accumulatedRef.current.trim());
      }

      setTranscript((accumulatedRef.current + interimText).trim());
    };

    recognition.onerror = (event: any) => {
      const msg = event.error;
      if (msg !== 'aborted' && msg !== 'no-speech') {
        onError?.(msg);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognition, isListening, lang, onFinalTranscript, onError, stopListening]);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
  };
}
