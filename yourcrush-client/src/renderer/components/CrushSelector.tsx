import { useAppStore } from '../store';

export function CrushSelector() {
  const { crushSlug, setCrush } = useAppStore();

  return (
    <div className="crush-selector">
      <h3>当前角色</h3>
      <select
        value={crushSlug}
        onChange={(e) => setCrush(e.target.value)}
      >
        <option value="example">example</option>
      </select>
    </div>
  );
}