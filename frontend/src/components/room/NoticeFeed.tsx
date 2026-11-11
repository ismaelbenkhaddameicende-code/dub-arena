import type { Notice } from '../../hooks/useRoomSocket';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

export function NoticeFeed({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.slice(-3).reverse().map((notice) => {
        const Icon = notice.level === 'error' ? XCircle : notice.level === 'warn' ? AlertTriangle : Info;
        const tone = notice.level === 'error' ? 'text-rose' : notice.level === 'warn' ? 'text-amber' : 'text-cyan';
        return (
          <div key={notice.id} className="flex items-start gap-2 rounded-lg border border-line/70 bg-ink-900/70 px-3 py-2 text-[12px] text-zinc-300">
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
            <span>{notice.message}</span>
          </div>
        );
      })}
    </div>
  );
}
