import { useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { useAppStore } from '../store';

// 获取当前日期（YYYY-MM-DD 格式）
function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function NarrativeView() {
  const narrativeText = useAppStore((s) => s.narrativeText);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const resetNarrative = useAppStore((s) => s.resetNarrative);
  const setError = useAppStore((s) => s.setError);

  const content = useMemo(() => {
    return DOMPurify.sanitize(narrativeText, {
      ALLOWED_TAGS: ['h1','h2','h3','p','em','strong','ul','ol','li','blockquote','code','pre','hr','br'],
      ALLOWED_ATTR: ['className'],
    });
  }, [narrativeText]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    // 重置之前的叙事内容
    resetNarrative();
    useAppStore.setState({ isGenerating: true });

    try {
      const date = getCurrentDate();
      await window.electron.generateNarrative(date);
    } catch (error) {
      setError('生成叙事失败：' + (error as Error).message);
      useAppStore.setState({ isGenerating: false });
    }
  }, [isGenerating, resetNarrative, setError]);

  return (
    <div className="narrative-view">
      <div className="narrative-header">
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? '生成中...' : '生成叙事'}
        </button>
      </div>
      <div className="narrative-content">
        <ReactMarkdown>{content}</ReactMarkdown>
        {isGenerating && <span className="typing-cursor">▊</span>}
      </div>
    </div>
  );
}