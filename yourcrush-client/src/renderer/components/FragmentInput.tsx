import { useState } from 'react';
import { useAppStore } from '../store';
import type { FragmentInput as FragmentInputType } from '../../shared/types';

const MOODS = [
  { id: 'positive', emoji: '😊', label: '开心' },
  { id: 'negative', emoji: '😢', label: '在意' },
  { id: 'neutral', emoji: '😐', label: '平静' },
  { id: 'mixed', emoji: '😶', label: '复杂' },
] as const;

const ORIGINS = [
  { id: 'user', label: '用户' },
  { id: 'crush', label: 'Crush' },
  { id: 'ambient', label: '环境' },
] as const;

export function FragmentInput() {
  const [content, setContent] = useState('');
  const [origin, setOrigin] = useState<FragmentInputType['origin']>('user');
  const [mood, setMood] = useState<FragmentInputType['mood']>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addFragment, setError } = useAppStore();

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const fragment = await window.electron.sendFragment({
        content, origin, mood, env_tags: [], behavior_tags: [],
      });
      addFragment(fragment);
      setContent('');
      setMood(undefined); // 重置 mood
    } catch (error) {
      setError('保存失败：' + (error as Error).message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fragment-input">
      <div className="origin-selector">
        {ORIGINS.map(o => (
          <button key={o.id} className={origin === o.id ? 'active' : ''} onClick={() => setOrigin(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="mood-selector">
        {MOODS.map(m => (
          <button key={m.id} className={mood === m.id ? 'active' : ''} onClick={() => setMood(mood === m.id ? undefined : m.id)}>
            {m.emoji}
          </button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="记录今天的碎片..." disabled={isSubmitting} />
      <button onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
        {isSubmitting ? '保存中...' : '记录'}
      </button>
    </div>
  );
}