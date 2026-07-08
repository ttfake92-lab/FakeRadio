// 打字机渲染器: 把 SSE 到达的文本块以匀速逐字显示。
//
// 服务端的 /api/chat/stream 是"LLM 整段完成后按句 emit"——所有 chunk 几乎同时到达,
// 前端直接 append 看不到流式效果。这里把到达的文本进队列,按固定节奏逐字放出,
// 积压越多每拍放出的字越多(追赶),保证长回复不会拖太久。

export type Typewriter = {
  push(chunk: string): void;
  /** 流结束:传入最终全文(可能比 chunks 拼接多出后缀)。队列播完后触发 onDone。 */
  finish(finalText: string): void;
  /** 立刻停止(组件卸载/用户发新消息时),不再触发任何回调。 */
  cancel(): void;
};

export function createTypewriter(opts: {
  onUpdate: (text: string) => void;
  onDone: (text: string) => void;
  /** 每拍间隔 ms,默认 24 */
  intervalMs?: number;
}): Typewriter {
  const intervalMs = opts.intervalMs ?? 24;
  let shown = "";
  let queue = "";
  let finalText: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick() {
    if (cancelled) {
      stopTimer();
      return;
    }
    if (queue.length === 0) {
      stopTimer();
      if (finalText !== null) {
        const done = finalText;
        finalText = null;
        opts.onDone(done);
      }
      return;
    }
    // 基础 2 字/拍(约 80 字/秒);积压大时加速追赶,上限 8 字/拍。
    const step = Math.min(8, Math.max(2, Math.ceil(queue.length / 30)));
    shown += queue.slice(0, step);
    queue = queue.slice(step);
    opts.onUpdate(shown);
  }

  function ensureTimer() {
    if (!timer && !cancelled) {
      timer = setInterval(tick, intervalMs);
    }
  }

  return {
    push(chunk: string) {
      if (cancelled || !chunk) return;
      queue += chunk;
      ensureTimer();
    },
    finish(text: string) {
      if (cancelled) return;
      const pending = shown + queue;
      if (text.startsWith(pending)) {
        // 最终全文比已入队的多出后缀(服务端 done.text 常带补充内容),补进队列继续打
        queue += text.slice(pending.length);
      } else if (text.startsWith(shown)) {
        queue = text.slice(shown.length);
      } else {
        // 全文与已显示内容对不上(错误兜底等场景):不重打,直接定稿
        shown = text;
        queue = "";
      }
      finalText = text;
      if (queue.length === 0) {
        stopTimer();
        const done = finalText;
        finalText = null;
        opts.onUpdate(done);
        opts.onDone(done);
        return;
      }
      ensureTimer();
    },
    cancel() {
      cancelled = true;
      stopTimer();
    }
  };
}
