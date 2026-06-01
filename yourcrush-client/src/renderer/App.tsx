import { useEffect } from 'react';
import { useAppStore } from './store';
import { StartupPage } from './pages/StartupPage';
import { AgentConfigPage } from './pages/AgentConfigPage';
import { CreateUserPage } from './pages/CreateUserPage';
import { CreateCrushPage } from './pages/CreateCrushPage';
import { CrushSelector } from './components/CrushSelector';
import { FragmentList } from './components/FragmentList';
import { NarrativeView } from './components/NarrativeView';
import { FragmentInput } from './components/FragmentInput';
import { ErrorToast } from './components/ErrorToast';

function WritingLayout() {
  const { crushSlug, appendNarrative, setError } = useAppStore();

  // 切换角色
  useEffect(() => {
    window.electron.switchCrush(crushSlug).catch((err: Error) => {
      setError('切换角色失败：' + err.message);
    });
  }, [crushSlug]);

  // 监听流式输出 + bridge 断连事件
  useEffect(() => {
    const unsubs = [
      window.electron.onNarrativeDelta(appendNarrative),
      window.electron.onStreamEnd(() => useAppStore.setState({ isGenerating: false })),
      window.electron.onStreamError((err: string) => {
        setError('生成失败：' + err);
        useAppStore.setState({ isGenerating: false });
      }),
    ];

    // 监听 Python bridge 断连事件
    const unsubBridge = window.electron.onBridgeDisconnect((data: { code: number }) => {
      useAppStore.setState({ isGenerating: false });
      setError('Python 进程已断开，请重启应用');
    });
    unsubs.push(unsubBridge);

    return () => {
      unsubs.forEach(fn => fn());
    };
  }, [appendNarrative, setError]);

  return (
    <div className="app">
      <aside className="sidebar">
        <CrushSelector />
        <FragmentList />
      </aside>
      <main className="main">
        <NarrativeView />
        <FragmentInput />
      </main>
    </div>
  );
}

export function App() {
  const currentPage = useAppStore((s) => s.currentPage);

  return (
    <>
      {currentPage === 'startup' && <StartupPage />}
      {currentPage === 'writing' && <WritingLayout />}
      {currentPage === 'agent-config' && <AgentConfigPage />}
      {currentPage === 'create-user' && <CreateUserPage />}
      {currentPage === 'create-crush' && <CreateCrushPage />}
      <ErrorToast />
    </>
  );
}
