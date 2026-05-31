import { useState } from 'react';
import { useAppStore } from '../store';

interface CrushProfile {
  // 基础信息（必填）
  name: string;
  nickname: string;

  // 基本信息（可选）
  knowDuration: string;
  relationshipStatus: string;
  occupation: string;
  city: string;
  howMet: string;

  // 性格画像（可选）
  mbti: string;
  zodiac: string;
  personality: string[];
  impression: string;
}

const INITIAL_PROFILE: CrushProfile = {
  name: '',
  nickname: '',
  knowDuration: '',
  relationshipStatus: '',
  occupation: '',
  city: '',
  howMet: '',
  mbti: '',
  zodiac: '',
  personality: [],
  impression: '',
};

const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

const ZODIAC_OPTIONS = [
  '白羊座', '金牛座', '双子座', '巨蟹座',
  '狮子座', '处女座', '天秤座', '天蝎座',
  '射手座', '摩羯座', '水瓶座', '双鱼座',
];

const PERSONALITY_TAGS = [
  '温柔', '高冷', '活泼', '内向', '外向',
  '幽默', '严肃', '可爱', '成熟', '阳光',
  '安静', '话多', '话少', '贴心', '独立',
];

const RELATIONSHIP_STATUS = [
  '暗恋', '暧昧', '同事', '同学', '朋友',
  '相亲', '前任', '网友', '邻居',
];

// 生成 slug：中文转拼音简写，英文小写，空格替换为下划线
function generateSlug(name: string): string {
  // 简单处理：去掉特殊字符，转小写，空格替换为下划线
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_一-龥]/g, '')
    .slice(0, 32);
}

export function CreateCrushPage() {
  const setPage = useAppStore((s) => s.setPage);
  const setCrush = useAppStore((s) => s.setCrush);
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<CrushProfile>(INITIAL_PROFILE);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState('');

  const update = <K extends keyof CrushProfile>(key: K, value: CrushProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const togglePersonality = (tag: string) => {
    setProfile((prev) => ({
      ...prev,
      personality: prev.personality.includes(tag)
        ? prev.personality.filter((t) => t !== tag)
        : [...prev.personality, tag],
    }));
  };

  const handleNameChange = (name: string) => {
    update('name', name);
    setSlug(generateSlug(name));
  };

  const handleSave = async () => {
    if (!profile.name.trim()) return;

    setSaving(true);
    try {
      await window.electron.createCrush({
        ...profile,
        slug,
      });
      // 切换到新创建的角色
      setCrush(slug);
      setPage('startup');
    } finally {
      setSaving(false);
    }
  };

  const renderStep1 = () => (
    <div className="create-crush__step">
      <h2 className="create-crush__step-title">给ta起个代号</h2>
      <p className="create-crush__step-desc">
        不需要真名，昵称、备注名、外号都行
      </p>

      <div className="config-field">
        <label className="config-field__label">代号（必填）</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="如：小明 / 女神 / crush / 🐱"
          autoFocus
        />
      </div>

      {profile.name && (
        <div className="config-field">
          <label className="config-field__label">生成的 ID</label>
          <div className="create-crush__slug">{slug}</div>
          <span className="create-crush__slug-hint">文件将保存到 crushes/{slug}/</span>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="create-crush__step">
      <h2 className="create-crush__step-title">基本信息</h2>
      <p className="create-crush__step-desc">
        一句话介绍一下，想到什么说什么（可跳过）
      </p>

      <div className="config-field">
        <label className="config-field__label">认识时长</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.knowDuration}
          onChange={(e) => update('knowDuration', e.target.value)}
          placeholder="如：三个月、一年、刚认识"
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">关系状态</label>
        <div className="create-crush__tags">
          {RELATIONSHIP_STATUS.map((status) => (
            <button
              key={status}
              className={`create-crush__tag ${profile.relationshipStatus === status ? 'create-crush__tag--active' : ''}`}
              onClick={() => update('relationshipStatus', status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="config-field">
        <label className="config-field__label">职业</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.occupation}
          onChange={(e) => update('occupation', e.target.value)}
          placeholder="如：程序员、设计师、学生"
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">城市</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.city}
          onChange={(e) => update('city', e.target.value)}
          placeholder="如：北京、上海"
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">认识方式</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.howMet}
          onChange={(e) => update('howMet', e.target.value)}
          placeholder="如：同事、同学、相亲、社交软件"
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="create-crush__step">
      <h2 className="create-crush__step-title">性格画像</h2>
      <p className="create-crush__step-desc">
        用一句话描述ta的性格（可跳过）
      </p>

      <div className="config-field">
        <label className="config-field__label">MBTI 类型</label>
        <select
          className="config-field__select"
          value={profile.mbti}
          onChange={(e) => update('mbti', e.target.value)}
        >
          <option value="">不知道 / 不确定</option>
          {MBTI_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">星座</label>
        <select
          className="config-field__select"
          value={profile.zodiac}
          onChange={(e) => update('zodiac', e.target.value)}
        >
          <option value="">不知道 / 不确定</option>
          {ZODIAC_OPTIONS.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">性格标签（多选）</label>
        <div className="create-crush__tags">
          {PERSONALITY_TAGS.map((tag) => (
            <button
              key={tag}
              className={`create-crush__tag ${profile.personality.includes(tag) ? 'create-crush__tag--active' : ''}`}
              onClick={() => togglePersonality(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="config-field">
        <label className="config-field__label">主观印象</label>
        <textarea
          className="config-field__textarea"
          value={profile.impression}
          onChange={(e) => update('impression', e.target.value)}
          placeholder="ta最让你印象深刻的地方"
          rows={3}
        />
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="create-crush__step">
      <h2 className="create-crush__step-title">确认创建</h2>

      <div className="create-crush__preview">
        <div className="create-crush__preview-section">
          <h3>代号</h3>
          <p className="create-crush__preview-name">{profile.name}</p>
          <p className="create-crush__preview-slug">crushes/{slug}/</p>
        </div>

        {profile.knowDuration || profile.relationshipStatus || profile.occupation ? (
          <div className="create-crush__preview-section">
            <h3>基本信息</h3>
            {profile.knowDuration && <p><strong>认识时长：</strong>{profile.knowDuration}</p>}
            {profile.relationshipStatus && <p><strong>关系状态：</strong>{profile.relationshipStatus}</p>}
            {profile.occupation && <p><strong>职业：</strong>{profile.occupation}</p>}
            {profile.city && <p><strong>城市：</strong>{profile.city}</p>}
          </div>
        ) : null}

        {profile.mbti || profile.zodiac || profile.personality.length > 0 ? (
          <div className="create-crush__preview-section">
            <h3>性格画像</h3>
            {profile.mbti && <p><strong>MBTI：</strong>{profile.mbti}</p>}
            {profile.zodiac && <p><strong>星座：</strong>{profile.zodiac}</p>}
            {profile.personality.length > 0 && <p><strong>性格：</strong>{profile.personality.join('、')}</p>}
            {profile.impression && <p><strong>印象：</strong>{profile.impression}</p>}
          </div>
        ) : null}
      </div>

      <p className="create-crush__confirm-hint">
        确认后将创建以下文件：
      </p>
      <ul className="create-crush__file-list">
        <li>meta.json — 元数据</li>
        <li>persona.md — 人物性格</li>
        <li>memory.md — 关系记忆</li>
        <li>SKILL.md — 角色定义</li>
      </ul>
    </div>
  );

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4];
  const stepTitles = ['代号', '基本信息', '性格画像', '确认'];

  const canProceed = step === 1 ? profile.name.trim().length > 0 : true;

  return (
    <div className="create-crush">
      <div className="create-crush__header">
        <button className="create-crush__back" onClick={() => setPage('startup')}>
          ← 返回
        </button>
        <h1 className="create-crush__title">创建角色</h1>
      </div>

      <div className="create-crush__progress">
        {stepTitles.map((title, i) => (
          <div
            key={i}
            className={`create-crush__progress-step ${i + 1 === step ? 'create-crush__progress-step--active' : ''} ${i + 1 < step ? 'create-crush__progress-step--done' : ''}`}
          >
            <span className="create-crush__progress-num">{i + 1}</span>
            <span className="create-crush__progress-label">{title}</span>
          </div>
        ))}
      </div>

      <div className="create-crush__body">
        {steps[step - 1]()}
      </div>

      <div className="create-crush__actions">
        {step > 1 && (
          <button
            className="create-crush__btn create-crush__btn--secondary"
            onClick={() => setStep(step - 1)}
          >
            上一步
          </button>
        )}
        {step < steps.length ? (
          <button
            className="create-crush__btn create-crush__btn--primary"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed}
          >
            {step === 1 ? '开始创建' : '下一步'}
          </button>
        ) : (
          <button
            className="create-crush__btn create-crush__btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '创建中...' : '确认创建'}
          </button>
        )}
        {step > 1 && step < steps.length && (
          <button
            className="create-crush__btn create-crush__btn--skip"
            onClick={() => setStep(step + 1)}
          >
            跳过
          </button>
        )}
      </div>
    </div>
  );
}
