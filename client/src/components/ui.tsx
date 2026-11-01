import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Primary CTA (reference style): white pill, 3px brand-green border, semibold
 * green text, wrapped in a white pill "ring" with a drop shadow; hover lifts
 * slightly, active presses back down.
 */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const base =
    'min-h-[48px] rounded-full px-5 font-medium transition-all duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-deep disabled:opacity-50';
  if (variant === 'primary') {
    return (
      <span className="inline-flex rounded-full bg-surface p-1 shadow-[0_2px_2px_rgba(0,0,0,.18)]">
        <button
          className={`${base} border-[3px] border-primary bg-surface text-[17px] font-semibold text-primary-deep hover:-translate-y-0.5 hover:shadow-[0_6px_6px_rgba(0,0,0,.12)] active:translate-y-0 ${className}`}
          {...props}
        />
      </span>
    );
  }
  const styles = {
    secondary:
      'bg-primary text-strong shadow-[0_1px_2px_rgba(0,0,0,.08),0_4px_12px_rgba(0,0,0,.06)] hover:bg-primary-soft active:translate-y-px',
    ghost: 'text-[15px] text-strong hover:opacity-70 shadow-none',
    danger:
      'bg-surface text-red-700 border border-red-200 hover:bg-red-50 shadow-[0_1px_2px_rgba(0,0,0,.08)] active:translate-y-px',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Card({
  children,
  className = '',
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-borderc bg-surface p-4 ${
        elevated
          ? 'shadow-[0_8px_24px_rgba(0,0,0,.12)]'
          : 'shadow-[0_1px_2px_rgba(0,0,0,.05),0_6px_16px_rgba(0,0,0,.04)]'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium text-charcoal">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'min-h-[48px] rounded-xl border border-borderc bg-surface px-3 text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** Small mono tag (IBM Plex Mono 500, 13px) for references/evidence labels. */
export function MonoTag({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[13px] font-medium leading-none text-black">
      {children}
    </span>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'neutral' | 'demo';
  children: ReactNode;
}) {
  // pastel chips with dark text
  const styles = {
    good: 'bg-bluechip text-strong',
    warn: 'bg-peach text-strong',
    bad: 'bg-red-100 text-red-800',
    neutral: 'bg-cream text-muted',
    demo: 'bg-lime text-strong',
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Close panel"
        className="absolute inset-0 bg-charcoal/40"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[24px]">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cancel" className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-surface p-5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
        <h2 className="mb-3 text-[24px]">{title}</h2>
        {children}
      </div>
    </div>
  );
}
