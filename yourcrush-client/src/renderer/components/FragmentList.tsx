import { useState, useEffect } from 'react';
import { useAppStore } from '../store';

const ORIGIN_LABELS: Record<string, string> = {
  user: '👤 用户',
  crush: '💕 Crush',
  ambient: '🌿 环境',
};

const MOOD_EMOJI: Record<string, string> = {
  positive: '😊',
  negative: '😢',
  neutral: '😐',
  mixed: '😶',
};

export function FragmentList() {
  const { fragments, setFragments, setError } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    loadFragments(selectedDate);
  }, [selectedDate]);

  const loadFragments = async (date: string) => {
    try {
      const data = await window.electron.getFragments(date);
      setFragments(data);
    } catch (error) {
      setError('加载碎片失败：' + (error as Error).message);
    }
  };

  return (
    <div className="fragment-list">
      <div className="date-picker">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>
      <div className="fragments">
        {fragments.length === 0 ? (
          <p className="empty-state">暂无碎片</p>
        ) : (
          fragments.map((f) => (
            <div key={f.id} className="fragment-item">
              <div className="fragment-meta">
                <span className="origin">{ORIGIN_LABELS[f.origin]}</span>
                {f.mood && <span className="mood">{MOOD_EMOJI[f.mood]}</span>}
              </div>
              <p className="content">{f.content}</p>
              <span className="time">
                {new Date(f.created_at).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}