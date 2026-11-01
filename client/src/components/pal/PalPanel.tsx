import { useState, type FormEvent } from 'react';
import { PalAvatar } from './PalAvatar';
import { Button, inputClass } from '../ui';

/**
 * Pal shows short predefined prompts + quick-choice buttons + optional free
 * text. No LLM calls — all copy is written by us, choices come from props.
 */
export function PalPanel({
  prompt,
  state = 'welcome',
  choices = [],
  onChoice,
  allowFreeText = false,
  onFreeText,
  size = 'md',
  className = '',
}: {
  prompt: string;
  state?: 'welcome' | 'waiting' | 'clarify' | 'done';
  choices?: { label: string; value: string }[];
  onChoice?: (value: string) => void;
  allowFreeText?: boolean;
  onFreeText?: (text: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && onFreeText) onFreeText(text.trim());
  };
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border-2 border-dark bg-surface p-4 shadow-[2px_2px_0_#1f1f1f] ${className}`}
    >
      <div className="shrink-0">
        <PalAvatar size={size} state={state} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-hand text-xl leading-snug text-strong">{prompt}</p>
        {choices.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.map((c) => (
              <Button
                key={c.value}
                variant="secondary"
                onClick={() => onChoice?.(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        )}
        {allowFreeText && (
          <form onSubmit={submit} className="mt-3 flex gap-2">
            <input
              aria-label="Reply to Pal"
              className={`${inputClass} flex-1`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a short answer…"
            />
            <Button type="submit" variant="secondary">
              Send
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
