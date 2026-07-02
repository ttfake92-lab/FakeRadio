'use client';

import React from 'react';
import type { Track, TasteResponse, ShowJob } from '@fakeradio/shared';
import type { AgentMessage } from '../player/use-stream-connection';
import { QUICK_PROMPTS } from '../player/skin-config';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  from: 'DJ' | 'YOU';
  text: string;
  streaming?: boolean;
  origin?: 'broadcast' | 'chat';
  /** HH:MM，消息创建时刻，气泡时间戳用 */
  at?: string;
}

const MONO_LABEL: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '1.5px',
  color: 'var(--muted)',
};

// ─────────────────────────────────────────────────────────────
// ChatSection — RADIO AI 区（滚动消息流 + 推荐/进度/口味面板）
// ─────────────────────────────────────────────────────────────
export function ChatSection({
  connected,
  messages,
  agentMessages,
  chatEndRef,
  taste,
  showTaste,
  onToggleTaste,
  trackedJob,
  onDismissJob,
  pendingSuggestions,
  onConfirmSuggestion,
  onDismissSuggestions,
}: {
  connected: boolean;
  messages: ChatMessage[];
  agentMessages: AgentMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  taste: TasteResponse | null;
  showTaste: boolean;
  onToggleTaste: () => void;
  trackedJob: ShowJob | null;
  onDismissJob: () => void;
  pendingSuggestions: Track[];
  onConfirmSuggestion: (track: Track) => void;
  onDismissSuggestions: () => void;
}) {
  const chatMessages = messages.filter((m) => m.text.trim().length > 0 || m.streaming);

  return (
    <div
      ref={chatEndRef}
      style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 20px 4px', position: 'relative', zIndex: 2 }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px dotted var(--muted)', flex: 'none' }} />
          <div>
            <div style={{ fontSize: 10, letterSpacing: '1.5px' }}>RADIO AI</div>
            <div style={{ ...MONO_LABEL, fontSize: 8.5, marginTop: 3 }}>{connected ? 'CONNECTED' : 'OFFLINE'}</div>
          </div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9.5, letterSpacing: '1.5px', color: 'var(--muted)' }}>
          [ LIVE ]
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)', animation: 'blinklive 2s steps(1) infinite' }} />
        </span>
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {chatMessages.length === 0 && (
          <ChatBubble
            from="DJ"
            text={'晚上好，这里是 FakeRadio 88.7。\n想听点什么？跟我说说今晚的心情。'}
          />
        )}
        {chatMessages.map((m) => (
          <ChatBubble key={m.id} from={m.from} text={m.text} streaming={m.streaming} at={m.at} />
        ))}

        {pendingSuggestions.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...MONO_LABEL, letterSpacing: '2px' }}>DJ 推荐 · 选一首插到下一首</div>
            {pendingSuggestions.map((t) => (
              <button
                key={t.id}
                onClick={() => onConfirmSuggestion(t)}
                style={{ textAlign: 'left', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', color: 'var(--ink)', fontFamily: 'var(--font-courier)' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>《{t.title}》</span>{' '}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.artist}</span>
              </button>
            ))}
            <button onClick={onDismissSuggestions} style={{ alignSelf: 'flex-start', color: 'var(--muted)', fontSize: 10, letterSpacing: '1px' }}>
              忽略
            </button>
          </div>
        )}
      </div>

      {/* Production progress + trace */}
      {trackedJob && <ProductionProgressPanel job={trackedJob} onDismiss={onDismissJob} />}

      {/* Agent activity */}
      {agentMessages.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ ...MONO_LABEL, letterSpacing: '2px' }}>ACTIVITY</div>
          {agentMessages.slice(-3).map((msg, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>{msg.text}</div>
          ))}
        </div>
      )}

      {/* Taste */}
      {taste && (
        <div style={{ margin: '12px 0 8px' }}>
          <button
            onClick={onToggleTaste}
            style={{ ...MONO_LABEL, letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ fontSize: 8 }}>{showTaste ? '▼' : '▶'}</span>
            TASTE
          </button>
          {showTaste && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {taste.taste && <TasteBlock label="PROFILE" body={taste.taste} />}
              {taste.routines && <TasteBlock label="ROUTINES" body={taste.routines} />}
              {taste.playlists.length > 0 && (
                <div>
                  <div style={{ ...MONO_LABEL, marginBottom: 4 }}>PLAYLISTS</div>
                  {taste.playlists.map((pl) => (
                    <div key={pl.id} style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-courier)' }}>
                      <span style={{ fontWeight: 700 }}>{pl.name}</span>
                      {pl.description && <span style={{ color: 'var(--faint)', marginLeft: 6 }}>— {pl.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {taste.moodRules && <TasteBlock label="MOOD RULES" body={taste.moodRules} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TasteBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div style={{ ...MONO_LABEL, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontFamily: 'var(--font-courier)' }}>{body}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ChatBubble — AI 左侧带头像气泡 / 用户右对齐气泡
// ─────────────────────────────────────────────────────────────
function ChatBubble({ from, text, streaming, at }: { from: 'DJ' | 'YOU'; text: string; streaming?: boolean | undefined; at?: string | undefined }) {
  const isMe = from === 'YOU';

  const bubble = (
    <div
      style={{
        maxWidth: isMe ? '82%' : undefined,
        flex: isMe ? undefined : 1,
        border: '1px solid var(--line)',
        borderRadius: 12,
        background: 'var(--bubble)',
        padding: '12px 14px',
        fontFamily: 'var(--font-courier)',
      }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.6, fontWeight: isMe ? 400 : 700, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {text}
        {streaming && (
          <span
            style={{
              display: 'inline-block',
              width: '0.55em',
              height: '1em',
              background: 'var(--ink)',
              verticalAlign: '-0.12em',
              marginLeft: '0.18em',
              opacity: 0.6,
              animation: 'fr-caret 1.1s steps(1) infinite',
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 9, letterSpacing: '1.5px', color: 'var(--muted)', marginTop: 12 }}>
        {at ? `${at}  ` : ''}[ {isMe ? 'YOU' : 'AI HOST'} ]
      </div>
    </div>
  );

  if (isMe) {
    return <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{bubble}</div>;
  }
  return (
    <div style={{ display: 'flex', gap: 9 }}>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '1.5px solid var(--muted)',
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-courier)',
          fontSize: 12,
          letterSpacing: '1px',
          color: 'var(--muted)',
        }}
      >
        AI
      </span>
      {bubble}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ChatInput — 快捷指令 + 输入行
// ─────────────────────────────────────────────────────────────
export function ChatInput({
  inputDraft,
  onInputChange,
  onSend,
}: {
  inputDraft: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
}) {
  const canSend = inputDraft.trim().length > 0;
  return (
    <div style={{ borderTop: '1px solid var(--line)', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '9px 20px 0' }}>
        {QUICK_PROMPTS.map((qp) => (
          <button
            key={qp.label}
            onClick={() => onSend(qp.prompt)}
            style={{
              flex: 'none',
              padding: '4px 11px',
              border: '1px solid var(--line)',
              borderRadius: 999,
              color: 'var(--muted)',
              fontSize: 10,
              letterSpacing: '0.08em',
            }}
          >
            {qp.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend(inputDraft);
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 12px' }}
      >
        <input
          placeholder="Talk to the radio AI..."
          value={inputDraft}
          onChange={(e) => onInputChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 38,
            border: '1px solid var(--line)',
            borderRadius: 10,
            background: 'none',
            color: 'var(--ink)',
            fontFamily: 'var(--font-courier)',
            fontSize: 12,
            padding: '0 14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          aria-label="send"
          disabled={!canSend}
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            border: '1px solid var(--send-bd)',
            borderRadius: '50%',
            background: 'var(--send-bg)',
            color: 'var(--send-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSend ? 1 : 0.5,
            cursor: canSend ? 'pointer' : 'default',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 20V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ProductionProgressPanel — 编排进度 + trace
// ─────────────────────────────────────────────────────────────
const JOB_STATUS_LABELS: Record<string, string> = {
  pending: '排队中',
  running: '生成中',
  paused: '已暂停',
  'needs-replan': '待重排',
  completed: '已完成',
  failed: '失败',
};

export function ProductionProgressPanel({ job, onDismiss }: { job: ShowJob; onDismiss: () => void }) {
  const isActive = job.status === 'pending' || job.status === 'running';
  const isFailed = job.status === 'failed';
  const statusLabel = JOB_STATUS_LABELS[job.status] ?? job.status;
  const recentLogs = job.logs.slice(-3);
  const recentTrace = job.trace.slice(-4);

  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 12,
        background: 'var(--bubble)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: recentLogs.length + recentTrace.length > 0 ? 8 : 0,
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: '2px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: isFailed ? 'var(--danger)' : isActive ? 'var(--ink)' : '#4ade80',
              animation: isActive ? 'fr-pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          节目编排 · {statusLabel}
        </div>
        <button onClick={onDismiss} aria-label="关闭编排进度" style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1 }}>
          ✕
        </button>
      </div>

      {isFailed && job.error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.5, marginBottom: 6 }}>{job.error}</div>
      )}

      {recentLogs.map((log, i) => (
        <div
          key={`log-${i}`}
          style={{
            fontSize: 10.5,
            lineHeight: 1.6,
            color: log.level === 'error' ? 'var(--danger)' : 'var(--muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {log.phase ? `[${log.phase}] ` : ''}{log.message}
        </div>
      ))}

      {recentTrace.length > 0 && (
        <div style={{ marginTop: recentLogs.length > 0 ? 6 : 0 }}>
          {recentTrace.map((entry, i) => (
            <div
              key={`trace-${i}`}
              style={{
                fontSize: 10.5,
                lineHeight: 1.6,
                color: entry.success ? 'var(--faint)' : 'var(--danger)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.success ? '✓' : '✗'} {entry.operation}
              {entry.durationMs !== undefined ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ''}
              {' — '}{entry.errorSummary ?? entry.summary}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
