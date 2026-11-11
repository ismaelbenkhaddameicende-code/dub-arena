import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'dub-arena-install-dismissed';

/** Invita a instalar DUB ARENA en el movil (Android/Chrome o iOS/Safari). */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    const handler = (e: Event): void => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|android/i.test(navigator.userAgent);
    if (isIos && isSafari && !standalone) setIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || (!event && !iosHint)) return null;

  const dismiss = (): void => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const install = async (): Promise<void> => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  return (
    <div className="panel flex flex-wrap items-center gap-3 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-soft">
        <Smartphone className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white">Instala DUB ARENA en el movil</p>
        {iosHint ? (
          <p className="flex items-center gap-1 text-[11px] text-zinc-400">
            Toca <Share className="h-3 w-3" /> y elige "Anadir a pantalla de inicio"
          </p>
        ) : (
          <p className="text-[11px] text-zinc-400">Se abre a pantalla completa, con su icono y sin barra del navegador.</p>
        )}
      </div>
      {event && <Button className="px-3 py-2 text-[13px]" onClick={() => void install()}><Download className="h-4 w-4" /> Instalar</Button>}
      <button onClick={dismiss} className="rounded-lg p-1.5 text-zinc-600 hover:text-zinc-300" aria-label="Descartar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
