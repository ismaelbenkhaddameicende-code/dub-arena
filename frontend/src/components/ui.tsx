import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  variant = 'primary', loading, className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    subtle: 'btn text-zinc-300 hover:text-white hover:bg-ink-700/60',
  };
  return (
    <button className={clsx(styles[variant], className)} disabled={props.disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="block text-xs text-rose">{error}</span> : hint ? <span className="hint block">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('input', className)} {...props} />;
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('panel p-5', className)} {...rest}>{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'live' | 'warn' | 'ok' | 'accent' }) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-ink-800/70 text-zinc-300',
    live: 'border-rose/40 bg-rose/10 text-rose',
    warn: 'border-amber/40 bg-amber/10 text-amber',
    ok: 'border-mint/40 bg-mint/10 text-mint',
    accent: 'border-accent/40 bg-accent/10 text-accent-soft',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-ink-950"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      title={name}
    >
      {initials || '?'}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {label ?? 'Cargando'}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, width = 'max-w-lg',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('panel relative w-full animate-fade-up p-6', width)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-ink-700 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/80 px-6 py-12 text-center">
      <div className="rounded-2xl border border-line bg-ink-800/60 p-3 text-accent-soft">{icon}</div>
      <h4 className="font-display text-base font-semibold text-white">{title}</h4>
      <p className="max-w-sm text-sm text-zinc-500">{description}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: string; children: ReactNode }) {
  const tones = {
    info: 'border-accent/30 bg-accent/5 text-zinc-300',
    warn: 'border-amber/30 bg-amber/5 text-amber',
    error: 'border-rose/30 bg-rose/5 text-rose',
    success: 'border-mint/30 bg-mint/5 text-mint',
  };
  return (
    <div className={clsx('rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-[13px] leading-relaxed opacity-95">{children}</div>
    </div>
  );
}
