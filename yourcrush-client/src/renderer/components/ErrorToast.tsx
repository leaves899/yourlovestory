import { useAppStore } from '../store';

export function ErrorToast() {
  const error = useAppStore((s) => s.error);

  if (!error) return null;

  return (
    <div className="error-toast">
      {error}
    </div>
  );
}