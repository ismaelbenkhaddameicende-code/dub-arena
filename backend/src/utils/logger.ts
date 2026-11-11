type Level = 'info' | 'warn' | 'error';

const stamp = () => new Date().toISOString().slice(11, 23);

function write(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `[${stamp()}] ${level.toUpperCase().padEnd(5)} ${scope} :: ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (extra === undefined) fn(line); else fn(line, extra);
}

export function logger(scope: string) {
  return {
    info: (m: string, e?: unknown) => write('info', scope, m, e),
    warn: (m: string, e?: unknown) => write('warn', scope, m, e),
    error: (m: string, e?: unknown) => write('error', scope, m, e),
  };
}
