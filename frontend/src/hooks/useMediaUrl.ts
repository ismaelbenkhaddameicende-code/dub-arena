import { useEffect, useState } from 'react';
import { signedUrl } from '../lib/api';

/** Obtiene una URL firmada y temporal para un video o una grabacion privada. */
export function useMediaUrl(resourceId: string | null | undefined, kind: 'media' | 'recording'): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!resourceId) { setUrl(null); return; }
    signedUrl(resourceId, kind)
      .then((next) => { if (!cancelled) setUrl(next); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [resourceId, kind]);

  return url;
}
