"use client";

import { useEffect, useRef, useState } from "react";
import { writeMessage, subscribeMessages } from "@/lib/room";
import type { ChatMessage } from "@/lib/room";

interface Props {
  roomId: string;
  riderId: string;
  riderName: string;
  onClose: () => void;
}

export default function ChatPanel({ roomId, riderId, riderName, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeMessages(roomId, setMessages);
    return unsub;
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    writeMessage(roomId, { riderId, riderName, text: trimmed });
    setText("");
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[var(--background)]">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-semibold">Chat</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--surface)] transition-colors"
          aria-label="Close chat"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--muted)] text-center pt-8">No messages yet</p>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.riderId === riderId;
          const showName = i === 0 || messages[i - 1].riderId !== msg.riderId;
          return (
            <div key={i} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              {showName && (
                <span className={`text-xs font-medium text-[var(--muted)] mb-0.5 px-1 ${isMine ? "text-right" : ""}`}>
                  {isMine ? "You" : msg.riderName}
                </span>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                  isMine
                    ? "bg-[var(--accent)] text-[var(--background)] rounded-tr-md"
                    : "bg-[var(--surface)] text-[var(--foreground)] rounded-tl-md"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)]">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message…"
          maxLength={500}
          className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="shrink-0 w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--background)] flex items-center justify-center disabled:opacity-40 active:opacity-80 transition-opacity"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
