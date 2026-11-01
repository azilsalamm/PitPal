import { useId, useMemo, useState } from 'react';
import { inputClass } from './ui';

/**
 * Simple keyboard-operable combobox: type to filter, arrow keys to move,
 * Enter to pick, Escape to close. Also allows free text ("Other"/manual).
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(value.toLowerCase())),
    [options, value],
  );
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && filtered[highlight]) {
            e.preventDefault();
            onChange(filtered[highlight]);
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-borderc bg-surface shadow-lg"
        >
          {filtered.map((o, i) => (
            <li key={o} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`min-h-[48px] w-full px-3 text-left ${
                  i === highlight ? 'bg-cream' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
