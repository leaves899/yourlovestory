import { useState } from 'react';
import { useAppStore } from '../store';

interface UserProfile {
  // 基础信息
  mbti: string;
  personalityTags: string[];
  ageStage: string;
  profession: string;

  // 说话习惯
  toneWords: string;
  catchphrase: string;
  expressionStyle: string;

  // 恋爱观
  crushView: string;
  intimacyAttitude: string;
  relationshipValue: string;

  // 心理特征
  emotionTriggers: string;
  attachmentType: string;
  copingStyle: string;

  // 行为偏好
  protagonistType: string;
  emotionalTone: string;
  tabooElements: string;

  // 写作风格
  perspective: string;
  narrativeDistance: string;
  emotionalIntensity: string;
  innerMonologueRatio: string;
  dialogueStyle: string;
  plotPacing: string;
  sceneTransition: string;
  dailyCoverage: string;
  favoriteElements: string;
  dislikedElements: string;
}

const INITIAL_PROFILE: UserProfile = {
  mbti: '',
  personalityTags: [],
  ageStage: '',
  profession: '',
  toneWords: '',
  catchphrase: '',
  expressionStyle: '直接',
  crushView: '',
  intimacyAttitude: '',
  relationshipValue: '',
  emotionTriggers: '',
  attachmentType: '安全型',
  copingStyle: '',
  protagonistType: '成长型',
  emotionalTone: '日常温馨',
  tabooElements: '',
  perspective: '第一人称',
  narrativeDistance: '代入感强',
  emotionalIntensity: '中',
  innerMonologueRatio: '中',
  dialogueStyle: '内心独白多',
  plotPacing: '中',
  sceneTransition: '中',
  dailyCoverage: '重点时段',
  favoriteElements: '',
  dislikedElements: '',
};

const MBTI_OPTIONS = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

const PERSONALITY_TAGS = [
  '内向', '外向', '理性', '感性', '敏感', '钝感',
  '独立', '依赖', '主动', '被动', '乐观', '悲观',
  '幽默', '严肃', '温柔', '强势', '细腻', '粗线条',
];

const AGE_STAGES = ['18-22', '23-26', '27-30', '31-35', '35+'];

const EXPRESSION_STYLES = ['直接', '含蓄', '幽默', '文艺', '简洁'];
const ATTACHMENT_TYPES = ['焦虑型', '回避型', '安全型'];
const PROTAGONIST_TYPES = ['主动型', '被动型', '成长型'];
const EMOTIONAL_TONES = ['甜蜜', '虐心', '日常温馨', '虐恋情深', '轻松搞笑'];
const PERSPECTIVES = ['第一人称', '第三人称'];
const NARRATIVE_DISTANCES = ['代入感强', '旁观者视角'];
const INTENSITY_LEVELS = ['高', '中', '低'];
const PACING_OPTIONS = ['快', '中', '慢'];

export function CreateUserPage() {
  const setPage = useAppStore((s) => s.setPage);
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>(INITIAL_PROFILE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tag: string) => {
    setProfile((prev) => ({
      ...prev,
      personalityTags: prev.personalityTags.includes(tag)
        ? prev.personalityTags.filter((t) => t !== tag)
        : [...prev.personalityTags, tag],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await window.electron.saveUserProfile(profile as unknown as Record<string, unknown>);
      setPage('startup');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderStep1 = () => (
    <div className="create-user__step">
      <h2 className="create-user__step-title">基础信息</h2>

      <div className="config-field">
        <label className="config-field__label">MBTI 类型</label>
        <select
          className="config-field__select"
          value={profile.mbti}
          onChange={(e) => update('mbti', e.target.value)}
        >
          <option value="">请选择</option>
          {MBTI_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">性格标签（多选）</label>
        <div className="create-user__tags">
          {PERSONALITY_TAGS.map((tag) => (
            <button
              key={tag}
              className={`create-user__tag ${profile.personalityTags.includes(tag) ? 'create-user__tag--active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="config-field">
        <label className="config-field__label">年龄阶段</label>
        <select
          className="config-field__select"
          value={profile.ageStage}
          onChange={(e) => update('ageStage', e.target.value)}
        >
          <option value="">请选择</option>
          {AGE_STAGES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">职业</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.profession}
          onChange={(e) => update('profession', e.target.value)}
          placeholder="如：程序员、设计师、学生"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="create-user__step">
      <h2 className="create-user__step-title">说话习惯与恋爱观</h2>

      <div className="config-field">
        <label className="config-field__label">语气词</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.toneWords}
          onChange={(e) => update('toneWords', e.target.value)}
          placeholder="如：嗯、啊、哈哈、嘻嘻"
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">口头禅</label>
        <input
          className="config-field__input"
          type="text"
          value={profile.catchphrase}
          onChange={(e) => update('catchphrase', e.target.value)}
          placeholder="如：真的假的、绝了、离谱"
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">表达偏好</label>
        <select
          className="config-field__select"
          value={profile.expressionStyle}
          onChange={(e) => update('expressionStyle', e.target.value)}
        >
          {EXPRESSION_STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">对暗恋的看法</label>
        <textarea
          className="config-field__textarea"
          value={profile.crushView}
          onChange={(e) => update('crushView', e.target.value)}
          placeholder="你觉得暗恋是什么样的感觉？"
          rows={3}
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">对亲密关系的态度</label>
        <textarea
          className="config-field__textarea"
          value={profile.intimacyAttitude}
          onChange={(e) => update('intimacyAttitude', e.target.value)}
          placeholder="你向往什么样的亲密关系？"
          rows={3}
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">在关系中看重什么</label>
        <textarea
          className="config-field__textarea"
          value={profile.relationshipValue}
          onChange={(e) => update('relationshipValue', e.target.value)}
          placeholder="如：信任、默契、独立空间"
          rows={3}
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="create-user__step">
      <h2 className="create-user__step-title">心理特征与行为偏好</h2>

      <div className="config-field">
        <label className="config-field__label">情绪触发点</label>
        <textarea
          className="config-field__textarea"
          value={profile.emotionTriggers}
          onChange={(e) => update('emotionTriggers', e.target.value)}
          placeholder="什么会让你开心/难过/焦虑？"
          rows={3}
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">依恋类型</label>
        <select
          className="config-field__select"
          value={profile.attachmentType}
          onChange={(e) => update('attachmentType', e.target.value)}
        >
          {ATTACHMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">应对方式</label>
        <textarea
          className="config-field__textarea"
          value={profile.copingStyle}
          onChange={(e) => update('copingStyle', e.target.value)}
          placeholder="面对冲突/压力时你怎么处理？"
          rows={3}
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">喜欢的主角类型</label>
        <select
          className="config-field__select"
          value={profile.protagonistType}
          onChange={(e) => update('protagonistType', e.target.value)}
        >
          {PROTAGONIST_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">喜欢的情感基调</label>
        <select
          className="config-field__select"
          value={profile.emotionalTone}
          onChange={(e) => update('emotionalTone', e.target.value)}
        >
          {EMOTIONAL_TONES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">雷区</label>
        <textarea
          className="config-field__textarea"
          value={profile.tabooElements}
          onChange={(e) => update('tabooElements', e.target.value)}
          placeholder="不希望在故事中出现的元素"
          rows={3}
        />
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="create-user__step">
      <h2 className="create-user__step-title">写作风格偏好</h2>

      <div className="config-field">
        <label className="config-field__label">人称视角</label>
        <select
          className="config-field__select"
          value={profile.perspective}
          onChange={(e) => update('perspective', e.target.value)}
        >
          {PERSPECTIVES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">叙事距离</label>
        <select
          className="config-field__select"
          value={profile.narrativeDistance}
          onChange={(e) => update('narrativeDistance', e.target.value)}
        >
          {NARRATIVE_DISTANCES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">情感浓度</label>
        <select
          className="config-field__select"
          value={profile.emotionalIntensity}
          onChange={(e) => update('emotionalIntensity', e.target.value)}
        >
          {INTENSITY_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">内心戏比重</label>
        <select
          className="config-field__select"
          value={profile.innerMonologueRatio}
          onChange={(e) => update('innerMonologueRatio', e.target.value)}
        >
          {INTENSITY_LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">对话风格</label>
        <select
          className="config-field__select"
          value={profile.dialogueStyle}
          onChange={(e) => update('dialogueStyle', e.target.value)}
        >
          <option value="内心独白多">内心独白多</option>
          <option value="外部行动多">外部行动多</option>
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">剧情节奏</label>
        <select
          className="config-field__select"
          value={profile.plotPacing}
          onChange={(e) => update('plotPacing', e.target.value)}
        >
          {PACING_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="config-field">
        <label className="config-field__label">喜欢的元素</label>
        <textarea
          className="config-field__textarea"
          value={profile.favoriteElements}
          onChange={(e) => update('favoriteElements', e.target.value)}
          placeholder="如：眼神交流、肢体接触、心理博弈"
          rows={3}
        />
      </div>

      <div className="config-field">
        <label className="config-field__label">讨厌的元素</label>
        <textarea
          className="config-field__textarea"
          value={profile.dislikedElements}
          onChange={(e) => update('dislikedElements', e.target.value)}
          placeholder="如：过度肉欲、太狗血、太甜腻"
          rows={3}
        />
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="create-user__step">
      <h2 className="create-user__step-title">确认档案</h2>
      <div className="create-user__preview">
        <div className="create-user__preview-section">
          <h3>基础信息</h3>
          <p><strong>MBTI：</strong>{profile.mbti || '未填写'}</p>
          <p><strong>性格标签：</strong>{profile.personalityTags.length > 0 ? profile.personalityTags.join('、') : '未填写'}</p>
          <p><strong>年龄阶段：</strong>{profile.ageStage || '未填写'}</p>
          <p><strong>职业：</strong>{profile.profession || '未填写'}</p>
        </div>

        <div className="create-user__preview-section">
          <h3>说话习惯</h3>
          <p><strong>语气词：</strong>{profile.toneWords || '未填写'}</p>
          <p><strong>口头禅：</strong>{profile.catchphrase || '未填写'}</p>
          <p><strong>表达偏好：</strong>{profile.expressionStyle}</p>
        </div>

        <div className="create-user__preview-section">
          <h3>恋爱观</h3>
          <p><strong>对暗恋的看法：</strong>{profile.crushView || '未填写'}</p>
          <p><strong>对亲密关系的态度：</strong>{profile.intimacyAttitude || '未填写'}</p>
          <p><strong>在关系中看重什么：</strong>{profile.relationshipValue || '未填写'}</p>
        </div>

        <div className="create-user__preview-section">
          <h3>写作风格</h3>
          <p><strong>视角：</strong>{profile.perspective} · {profile.narrativeDistance}</p>
          <p><strong>情感浓度：</strong>{profile.emotionalIntensity}</p>
          <p><strong>节奏：</strong>{profile.plotPacing}</p>
        </div>
      </div>
    </div>
  );

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];
  const stepTitles = ['基础信息', '说话习惯与恋爱观', '心理特征', '写作风格', '确认'];

  return (
    <div className="create-user">
      <div className="create-user__header">
        <button className="create-user__back" onClick={() => setPage('startup')}>
          ← 返回
        </button>
        <h1 className="create-user__title">创建用户档案</h1>
      </div>

      <div className="create-user__progress">
        {stepTitles.map((title, i) => (
          <div
            key={i}
            className={`create-user__progress-step ${i + 1 === step ? 'create-user__progress-step--active' : ''} ${i + 1 < step ? 'create-user__progress-step--done' : ''}`}
          >
            <span className="create-user__progress-num">{i + 1}</span>
            <span className="create-user__progress-label">{title}</span>
          </div>
        ))}
      </div>

      <div className="create-user__body">
        {steps[step - 1]()}
      </div>

      <div className="create-user__actions">
        {step > 1 && (
          <button
            className="create-user__btn create-user__btn--secondary"
            onClick={() => setStep(step - 1)}
          >
            上一步
          </button>
        )}
        {step < steps.length ? (
          <button
            className="create-user__btn create-user__btn--primary"
            onClick={() => setStep(step + 1)}
          >
            下一步
          </button>
        ) : (
          <button
            className="create-user__btn create-user__btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存档案'}
          </button>
        )}
      </div>

      {error && (
        <div className="create-user__error">{error}</div>
      )}
    </div>
  );
}
