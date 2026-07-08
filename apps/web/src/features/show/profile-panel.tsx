'use client';

import React, { useEffect, useState } from 'react';
import type { UserProfileResponse } from '@fakeradio/shared';
import { getSettings, getUserProfile, updateSettings } from '../../lib/api-client';
import { CollapsibleSection, FIELD_DESC, FIELD_INPUT, PANEL_LABEL, pillButton } from './panel-ui';
import { RoundAvatar, notifyWeatherUpdated, pickAndUploadAvatar } from '../studio/round-avatar';

// taste.md 等文件可能被 LLM 写入时包了一层 ```markdown 代码围栏,展示时剥掉
function stripCodeFence(text: string): string {
  return text.replace(/^```\w*\s*\n/, '').replace(/\n```\s*$/, '').trim();
}

// ─────────────────────────────────────────────────────────────
// ProfilePanel — 用户个人资料：画像 + 品味摘要 + 标签展示
// 入口：TopBar 左上角 FR 头像。
// ─────────────────────────────────────────────────────────────

function Tag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 11px',
        border: strong ? '1px solid var(--ink)' : '1px solid var(--line)',
        borderRadius: 999,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.08em',
        color: strong ? 'var(--ink)' : 'var(--muted)',
        fontWeight: strong ? 700 : 400,
      }}
    >
      {children}
    </span>
  );
}

export function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cityDraft, setCityDraft] = useState('');
  const [citySaving, setCitySaving] = useState(false);
  const [cityFeedback, setCityFeedback] = useState<string | null>(null);

  useEffect(() => {
    getUserProfile()
      .then(setProfile)
      .catch(() => setError('资料加载失败，请检查 server 是否在运行。'));
    getSettings()
      .then((data) => setCityDraft(data.settings.weatherCity ?? ''))
      .catch(() => { /* 城市留空,占位符提示默认值 */ });
  }, []);

  const handleSaveCity = async () => {
    setCitySaving(true);
    setCityFeedback(null);
    try {
      await updateSettings({ weatherCity: cityDraft.trim() });
      notifyWeatherUpdated();
      setCityFeedback('已保存，顶栏天气随即更新。');
    } catch (err) {
      setCityFeedback(err instanceof Error ? err.message : '保存失败');
    } finally {
      setCitySaving(false);
    }
  };

  if (error) {
    return <div style={{ ...FIELD_DESC, color: 'var(--danger)', padding: '20px 0' }}>{error}</div>;
  }
  if (!profile) {
    return <div style={{ ...PANEL_LABEL, padding: '20px 0' }}>LOADING…</div>;
  }

  return (
    <div>
      {/* 名片 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <RoundAvatar
          kind="user"
          size={52}
          border="1.5px solid var(--ink)"
          fallback="FR"
          fallbackStyle={{ fontSize: 15, fontWeight: 800, letterSpacing: '1px' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.3px' }}>我的 FakeRadio</div>
          <div style={{ ...PANEL_LABEL, marginTop: 4 }}>
            {profile.likedSongsCount} LIKED · {profile.favoritesCount} FAVORITES
          </div>
        </div>
        <button
          style={pillButton('ghost')}
          onClick={() => {
            pickAndUploadAvatar('user').catch((err) => {
              setCityFeedback(err instanceof Error ? err.message : '头像上传失败');
            });
          }}
        >
          换头像
        </button>
      </div>

      {/* 城市位置：顶栏天气行显示的城市，改完立即生效 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...PANEL_LABEL, marginBottom: 8 }}>CITY / LOCATION</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ ...FIELD_INPUT, flex: 1 }}
            placeholder="默认 Shanghai，支持中文城市名"
            value={cityDraft}
            onChange={(e) => setCityDraft(e.target.value)}
          />
          <button style={pillButton('primary')} onClick={handleSaveCity} disabled={citySaving}>
            {citySaving ? 'SAVING…' : 'SAVE'}
          </button>
        </div>
        <div style={{ ...FIELD_DESC, marginTop: 6 }}>
          {cityFeedback ?? '顶栏会显示这个城市的实时天气，推荐选歌也会参考它。'}
        </div>
      </div>

      {/* 标签 */}
      {(profile.tasteTags.length > 0 || profile.topArtists.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...PANEL_LABEL, marginBottom: 8 }}>TASTE TAGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.tasteTags.map((tag) => (
              <Tag key={`style-${tag}`} strong>{tag}</Tag>
            ))}
            {profile.topArtists.map((artist) => (
              <Tag key={`artist-${artist}`}>{artist}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* 品味摘要 */}
      <CollapsibleSection title="品味画像" defaultOpen>
        <div style={{ ...FIELD_DESC, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{stripCodeFence(profile.taste)}</div>
      </CollapsibleSection>

      {profile.profile.trim().length > 0 && (
        <CollapsibleSection title="关于我" defaultOpen={false}>
          <div style={{ ...FIELD_DESC, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', lineHeight: 1.7 }}>
            {profile.profile}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="日常节奏" defaultOpen={false}>
        <div style={{ ...FIELD_DESC, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{profile.routines}</div>
      </CollapsibleSection>

      <CollapsibleSection title="情绪规则" defaultOpen={false}>
        <div style={{ ...FIELD_DESC, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', lineHeight: 1.7 }}>
          {profile.moodRules}
        </div>
      </CollapsibleSection>
    </div>
  );
}
