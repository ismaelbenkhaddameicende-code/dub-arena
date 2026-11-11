import { useState } from 'react';
import { COLORS } from '../types/constants';
import { useAuth } from '../store/auth';
import { Alert, Avatar, Button, Card, Field, Input } from '../components/ui';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? COLORS[0]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      await updateProfile({ displayName, avatarColor });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Perfil</h1>
        <p className="hint">Asi te veran los demas participantes en la sala</p>
      </div>

      <Card>
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={displayName || user.displayName} color={avatarColor} size={64} />
          <div>
            <p className="font-display text-lg font-semibold text-white">{displayName || user.displayName}</p>
            <p className="text-xs text-zinc-500">{user.email}</p>
          </div>
        </div>

        <form onSubmit={save} className="space-y-5">
          <Field label="Nombre visible">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={40} />
          </Field>

          <div className="space-y-2">
            <span className="label">Color de tu avatar</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className={`h-9 w-9 rounded-full border-2 transition ${avatarColor === color ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  style={{ background: color }}
                  aria-label={`Color ${color}`}
                />
              ))}
            </div>
          </div>

          {error && <Alert tone="error">{error}</Alert>}
          {saved && <Alert tone="success">Perfil actualizado.</Alert>}

          <Button type="submit" loading={busy}>Guardar cambios</Button>
        </form>
      </Card>
    </div>
  );
}
