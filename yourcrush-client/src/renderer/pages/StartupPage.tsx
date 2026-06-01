import { useState, useEffect } from 'react';
import { useAppStore } from '../store';

interface CrushInfo {
  slug: string;
  name: string;
}

interface SkillCard {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  command: string;
  primary?: boolean;
  action: 'navigate' | 'cli';
}

const SKILLS: SkillCard[] = [
  {
    id: 'create-crush',
    icon: '💕',
    title: '创建角色',
    subtitle: 'Create Crush',
    desc: '蒸馏你的暗恋对象，生成 AI 角色 Skill',
    command: '/create-crush',
    action: 'navigate',
  },
  {
    id: 'create-user',
    icon: '👤',
    title: '用户档案',
    subtitle: 'Create User',
    desc: '录入你的性格特点和写作风格偏好',
    command: '/create-user',
    action: 'navigate',
  },
  {
    id: 'day',
    icon: '📝',
    title: '日常写作',
    subtitle: 'Day Writing',
    desc: '碎片日记模式，记录并生成生活叙事',
    command: '/day',
    primary: true,
    action: 'navigate',
  },
  {
    id: 'progress',
    icon: '📊',
    title: '进展追踪',
    subtitle: 'Progress',
    desc: '追踪暗恋关系阶段，查看指标和建议',
    command: '/progress',
    action: 'navigate',
  },
];

function SkillCardView({ skill }: { skill: SkillCard }) {
  const setPage = useAppStore((s) => s.setPage);

  const handleClick = () => {
    if (skill.action === 'navigate') {
      if (skill.id === 'create-user') {
        setPage('create-user');
      } else if (skill.id === 'create-crush') {
        setPage('create-crush');
      } else {
        setPage('writing');
      }
    }
  };

  return (
    <div
      className={`skill-card ${skill.primary ? 'skill-card--primary' : ''} ${skill.action === 'navigate' ? 'skill-card--clickable' : ''}`}
      onClick={handleClick}
    >
      <div className="skill-card__icon">{skill.icon}</div>
      <div className="skill-card__body">
        <h3 className="skill-card__title">{skill.title}</h3>
        <span className="skill-card__subtitle">{skill.subtitle}</span>
        <p className="skill-card__desc">{skill.desc}</p>
      </div>
      {skill.action === 'cli' ? (
        <div className="skill-card__footer">
          <code className="skill-card__cmd">{skill.command}</code>
          <span className="skill-card__hint">在 Claude CLI 中使用</span>
        </div>
      ) : (
        <div className="skill-card__footer">
          <span className="skill-card__enter">进入 →</span>
        </div>
      )}
    </div>
  );
}

export function StartupPage() {
  const { crushSlug, setCrush, setPage } = useAppStore();
  const [crushList, setCrushList] = useState<CrushInfo[]>([]);

  // 从磁盘加载角色列表
  useEffect(() => {
    window.electron.listCrushes()
      .then((list: CrushInfo[]) => {
        setCrushList(list);
        // 如果当前选中的角色不在列表中，选中第一个
        if (list.length > 0 && !list.some((c) => c.slug === crushSlug)) {
          setCrush(list[0].slug);
        }
      })
      .catch(() => {
        // 静默失败，显示空列表
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEnterWriting = () => {
    setPage('writing');
  };

  return (
    <div className="startup">
      <header className="startup__header">
        <h1 className="startup__title">yourcrush</h1>
        <p className="startup__tagline">将暗恋对象蒸馏成 AI Skill</p>
        <button
          className="startup__settings-btn"
          onClick={() => setPage('agent-config')}
          title="Agent 配置"
        >
          ⚙ 配置
        </button>
      </header>

      <section className="startup__skills">
        {SKILLS.map((skill) => (
          <SkillCardView key={skill.id} skill={skill} />
        ))}
      </section>

      <footer className="startup__footer">
        <div className="startup__quick">
          <span className="startup__quick-label">快速入口</span>
          <select
            className="startup__crush-select"
            value={crushSlug}
            onChange={(e) => setCrush(e.target.value)}
          >
            {crushList.length === 0 ? (
              <option value="">暂无角色，请先创建</option>
            ) : (
              crushList.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))
            )}
          </select>
          <button className="startup__enter-btn" onClick={handleEnterWriting}>
            进入写作
          </button>
        </div>
      </footer>
    </div>
  );
}
