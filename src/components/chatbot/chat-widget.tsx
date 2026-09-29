"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BotMessageSquareIcon, SendIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { askAssistant, type ChatReply } from "@/app/(app)/chatbot-actions";

type Message = { from: "user" | "bot"; text: string; reply?: ChatReply };

const WELCOME: ChatReply = {
  text: "Hi! Ask me about your current entries — counts, hearings, amounts recovered — or how to use the app.",
  suggestions: [
    "How many open entries?",
    "Hearings today",
    "Hearings this week",
    "Entries brought forward this year",
    "Amount recovered this year",
    "How do I create a new entry?",
  ],
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ from: "bot", text: WELCOME.text, reply: WELCOME }]);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  function send(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text }]);
    startTransition(async () => {
      let reply: ChatReply;
      try {
        reply = await askAssistant(text);
      } catch {
        reply = { text: "Sorry, something went wrong. Please try again." };
      }
      setMessages((m) => [...m, { from: "bot", text: reply.text, reply }]);
    });
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <section
          aria-label="Assistant"
          className="flex h-[32rem] max-h-[calc(100dvh-6rem)] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border bg-card shadow-elevation-4"
        >
          <header className="bg-hero flex items-center gap-2 px-4 py-3 text-white">
            <BotMessageSquareIcon className="size-5" />
            <div className="flex-1 leading-tight">
              <div className="text-sm font-semibold">Assistant</div>
              <div className="text-xs text-white/70">Answers from your current entries</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-md p-1 hover:bg-white/15"
            >
              <XIcon className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex flex-col gap-1.5", m.from === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.from === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.text}
                </div>
                {m.reply?.links && (
                  <ul className="flex w-full max-w-[85%] flex-col gap-1">
                    {m.reply.links.map((l) => (
                      <li key={l.href + l.label}>
                        <Link
                          href={l.href}
                          onClick={() => setOpen(false)}
                          className="block rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/60"
                        >
                          <span className="font-medium text-primary">{l.label}</span>
                          {l.detail && <span className="block truncate text-xs text-muted-foreground">{l.detail}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {m.reply?.suggestions && i === messages.length - 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.reply.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border bg-card px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent/60"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && <div className="text-xs text-muted-foreground">Looking that up…</div>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={300}
              placeholder="Ask about your entries…"
              aria-label="Message"
              className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="btn-3d flex size-9 items-center justify-center rounded-lg bg-gradient-to-b from-[color-mix(in_oklch,var(--primary),white_16%)] to-primary text-primary-foreground disabled:opacity-50"
            >
              <SendIcon className="size-4" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        className="btn-3d flex size-13 items-center justify-center rounded-full bg-gradient-to-br from-vivid-pink to-vivid-violet text-white [--btn-edge:var(--vivid-violet)]"
      >
        {open ? <XIcon className="size-5" /> : <BotMessageSquareIcon className="size-6" />}
      </button>
    </div>
  );
}
