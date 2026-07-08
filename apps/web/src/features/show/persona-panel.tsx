'use client';

import React, { useEffect, useState } from 'react';
import type { DjPersonaOverride, PersonaResponse } from '@fakeradio/shared';
import { getPersona, updatePersona } from '../../lib/api-client';
import { CollapsibleSection, FIELD_DESC, FIELD_INPUT, FIELD_LABEL, PANEL_LABEL, pillButton } from './panel-ui';
import { RoundAvatar, pickAndUploadAvatar } from '../studio/round-avatar';

// ─────────────────────────────────────────────────────────────
// PersonaPanel — DJ 人设：基础设定展示 + 用户自定义编辑
// 入口：聊天区 DJ 头像。编辑立即生效（聊天/口播/预热），无需重启。
// ─────────────────────────────────────────────────────────────

const EMPTY_OVERRIDE: DjPersonaOverride = { name: '', personaText: '', replyStyle: '', tone: '' };

export function PersonaPanel() {
  const [persona, setPersona] = useState<PersonaResponse | null>(null);
  const [draft, setDraft] = useState<DjPersonaOverride>(EMPTY_OVERRIDE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getPersona()
      .then((data) => {
        setPersona(data);
        setDraft(data.override ?? EMPTY_OVERRIDE);
      })
      .catch(() => setFeedback({ kind: 'error', text: '人设加载失败，请检查 server 是否在运行。' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const data = await updatePersona(draft);
      setPersona(data);
      setDraft(data.override ?? EMPTY_OVERRIDE);
      setFeedback({ kind: 'ok', text: '已保存，下一条 DJ 回复即生效。' });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const data = await updatePersona(EMPTY_OVERRIDE);
      setPersona(data);
      setDraft(EMPTY_OVERRIDE);
      setFeedback({ kind: 'ok', text: '已恢复默认人设。' });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : '重置失败' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ ...PANEL_LABEL, padding: '20px 0' }}>LOADING…</div>;
  }

  const displayName = draft.name.trim() || 'Nora';
  const hasCustom = persona?.override !== null && persona?.override !== undefined;

  return (
    <div>
      {/* DJ 名片 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <RoundAvatar
          kind="dj"
          size={52}
          border="1.5px solid var(--muted)"
          fallback={displayName.slice(0, 2).toUpperCase()}
          fallbackStyle={{ fontSize: 16, fontWeight: 800, letterSpacing: '1px' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.3px' }}>{displayName}</div>
          <div style={{ ...PANEL_LABEL, marginTop: 4 }}>
            FAKERADIO AI HOST {hasCustom ? '· CUSTOMIZED' : '· DEFAULT'}
          </div>
        </div>
        <button
          style={pillButton('ghost')}
          onClick={() => {
            pickAndUploadAvatar('dj').catch((err) => {
              setFeedback({ kind: 'error', text: err instanceof Error ? err.message : '头像上传失败' });
            });
          }}
        >
          换头像
        </button>
      </div>

      {/* 基础人设（只读） */}
      <CollapsibleSection title="基础人设设定" defaultOpen={!hasCustom}>
        <div style={{ ...FIELD_DESC, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', lineHeight: 1.7 }}>
          {persona?.base ?? ''}
        </div>
      </CollapsibleSection>

      {/* 自定义覆盖（可编辑） */}
      <CollapsibleSection title="自定义人设" defaultOpen extra={hasCustom ? <span style={PANEL_LABEL}>ON</span> : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={FIELD_LABEL}>DJ 名字</label>
          <input
            style={FIELD_INPUT}
            placeholder="默认 Nora"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={FIELD_LABEL}>人设</label>
          <textarea
            style={{ ...FIELD_INPUT, minHeight: 72, resize: 'vertical' }}
            placeholder="例：一位深夜爵士酒吧驻场十年的老 DJ，见过各种故事，说话带一点烟嗓的从容…"
            value={draft.personaText}
            onChange={(e) => setDraft((d) => ({ ...d, personaText: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={FIELD_LABEL}>回复方式</label>
          <textarea
            style={{ ...FIELD_INPUT, minHeight: 56, resize: 'vertical' }}
            placeholder="例：先回应我说的话，再给建议；每次不超过三句；多用具体的年代和事实…"
            value={draft.replyStyle}
            onChange={(e) => setDraft((d) => ({ ...d, replyStyle: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={FIELD_LABEL}>语气</label>
          <textarea
            style={{ ...FIELD_INPUT, minHeight: 56, resize: 'vertical' }}
            placeholder="例：慵懒、克制、偶尔冷幽默；不用感叹号…"
            value={draft.tone}
            onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
          />
        </div>
        <div style={{ ...FIELD_DESC }}>
          保存后立即对聊天回复和歌曲口播生效。留空的项沿用基础设定。
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={pillButton('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'SAVING…' : 'SAVE'}
          </button>
          {hasCustom && (
            <button style={pillButton('danger')} onClick={handleReset} disabled={saving}>
              恢复默认
            </button>
          )}
          {feedback && (
            <span style={{ ...FIELD_DESC, color: feedback.kind === 'error' ? 'var(--danger)' : 'var(--muted)' }}>
              {feedback.text}
            </span>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
