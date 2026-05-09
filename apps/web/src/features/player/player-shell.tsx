"use client";

import type { ChatResponse, FavoriteTrack, HealthResponse, NeteaseLoginStatus, NeteaseQrLoginChallenge, NextResponse, NowResponse, TasteResponse, TodayPlanResponse } from "@fakeradio/shared";
import type { AgentMessage } from "./use-stream-connection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addFavorite, buildMediaUrl, checkNeteaseQrLogin, createNeteaseQrLogin, getFavorites, getHealth, getNeteaseLoginStatus, getNext, getNow, getTaste, getTodayPlan, removeFavorite, sendChat, submitNeteaseCookie } from "../../lib/api-client";
import {
  formatDuration,
  getNextEpisodeLabel,
  getPlaybackLabel,
  getProviderStatusLabel,
  getSourceKindLabel,
  getStorySourceDescription,
  getStoryTypeLabel,
  getTrackSourceLabel,
  shouldWarnOnMockMusic
} from "./player-view-model";
import { useAudioEngine } from "./use-audio-engine";
import { usePlaybackState } from "./use-playback-state";
import { useStreamConnection } from "./use-stream-connection";
import { OnAirTerminal } from "./on-air-terminal";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getMusicStatus(health: HealthResponse | null) {
  const status = health?.adapters.music;
  return typeof status === "string" ? status : "mock";
}

function buildNowFromNext(result: NextResponse): NowResponse {
  return {
    playback: "playing",
    track: result.track,
    dj: { say: result.decision.say, audioUrl: result.tts.audioUrl, segue: result.decision.segue },
    queue: result.queue,
    updatedAt: new Date().toISOString()
  };
}

export function PlayerShell() {
  const [now, setNow] = useState<NowResponse | null>(null);
  const [taste, setTaste] = useState<TasteResponse | null>(null);
  const [plan, setPlan] = useState<TodayPlanResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [nextResult, setNextResult] = useState<NextResponse | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatReply, setChatReply] = useState<ChatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [neteaseLogin, setNeteaseLogin] = useState<NeteaseLoginStatus | null>(null);
  const [neteaseQr, setNeteaseQr] = useState<NeteaseQrLoginChallenge | null>(null);
  const [neteaseMessage, setNeteaseMessage] = useState("");
  const [neteaseCookieInput, setNeteaseCookieInput] = useState("");
  const neteaseQrCheckBusy = useRef(false);

  const audio = useAudioEngine();
  const playback = usePlaybackState(audio);
  const { streamStatus } = useStreamConnection(
    audio,
    useCallback((payload: NowResponse) => setNow(payload), []),
    useCallback((queue: NowResponse["queue"]) => {
      setNow((current) => (current === null ? current : { ...current, queue }));
    }, []),
    useCallback((dj: NowResponse["dj"]) => {
      setNow((current) => (current === null ? current : { ...current, dj }));
    }, []),
    useCallback((msg: AgentMessage) => {
      setAgentMessages((prev) => [...prev.slice(-19), msg]);
    }, [])
  );

  const track = now?.track ?? null;
  const playbackLabel = useMemo(() => getPlaybackLabel(now?.playback ?? "idle"), [now?.playback]);
  const musicStatus = getMusicStatus(health);
  const shouldWarn = shouldWarnOnMockMusic(musicStatus);
  const isFavorited = track !== null && favorites.some((f) => f.trackId === track.id);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    playback.setError(null);
    try {
      const [nowResponse, tasteResponse, planResponse, healthResponse, favoritesResponse, neteaseStatus] = await Promise.all([
        getNow(), getTaste(), getTodayPlan(), getHealth(), getFavorites(), getNeteaseLoginStatus()
      ]);
      setNow(nowResponse);
      setTaste(tasteResponse);
      setPlan(planResponse);
      setHealth(healthResponse);
      setFavorites(favoritesResponse.favorites);
      setNeteaseLogin(neteaseStatus);
    } catch (loadError) {
      playback.setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const handleRefresh = async () => {
    setIsActing(true);
    playback.setError(null);
    try {
      setNow(await getNow());
      setHealth(await getHealth());
      setNeteaseLogin(await getNeteaseLoginStatus());
    } catch (refreshError) {
      playback.setError(`刷新失败：${getErrorMessage(refreshError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopQrPolling = useCallback(() => {
    if (qrPollRef.current !== null) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  }, []);

  const pollQrOnce = useCallback(async (key: string) => {
    if (neteaseQrCheckBusy.current) return;
    neteaseQrCheckBusy.current = true;
    try {
      const result = await checkNeteaseQrLogin(key);
      setNeteaseMessage(result.message);
      if (result.loggedIn) {
        stopQrPolling();
        setNeteaseQr(null);
        setNeteaseLogin(await getNeteaseLoginStatus());
        setHealth(await getHealth());
      } else if (result.code === 800) {
        stopQrPolling();
        setNeteaseMessage("二维码已过期，请重新生成。");
      } else if (result.code === 8821) {
        stopQrPolling();
        setNeteaseQr(null);
      }
    } catch (loginError) {
      setNeteaseMessage(`检查登录失败：${getErrorMessage(loginError)}`);
    } finally {
      neteaseQrCheckBusy.current = false;
    }
  }, [stopQrPolling]);

  const handleCreateNeteaseQr = async () => {
    stopQrPolling();
    setIsActing(true);
    playback.setError(null);
    try {
      const qr = await createNeteaseQrLogin();
      setNeteaseQr(qr);
      setNeteaseMessage("请用网易云音乐 App 扫码授权，正在自动检测登录状态…");
      qrPollRef.current = setInterval(() => pollQrOnce(qr.key), 2000);
    } catch (loginError) {
      playback.setError(`生成网易云登录二维码失败：${getErrorMessage(loginError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleCheckNeteaseQr = async () => {
    if (neteaseQr === null) return;
    await pollQrOnce(neteaseQr.key);
  };

  const handleSubmitCookie = async () => {
    const cookie = neteaseCookieInput.trim();
    if (cookie.length === 0) return;
    setIsActing(true);
    playback.setError(null);
    try {
      const result = await submitNeteaseCookie(cookie);
      setNeteaseMessage(result.message);
      setNeteaseCookieInput("");
      if (result.success) {
        setNeteaseLogin(await getNeteaseLoginStatus());
        setHealth(await getHealth());
      }
    } catch (cookieError) {
      playback.setError(`Cookie 注入失败：${getErrorMessage(cookieError)}`);
    } finally {
      setIsActing(false);
    }
  };

  useEffect(() => {
    return () => stopQrPolling();
  }, [stopQrPolling]);

  const handleNext = async () => {
    setIsActing(true);
    playback.setError(null);
    try {
      const result = await getNext();
      setNextResult(result);
      setNow(buildNowFromNext(result));
    } catch (nextError) {
      playback.setError(`生成下一首失败：${getErrorMessage(nextError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatMessage.trim();
    if (message.length === 0) return;

    setIsActing(true);
    playback.setError(null);
    try {
      const reply = await sendChat(message);
      setChatReply(reply);
      setChatMessage("");

      // Execute action if returned
      if (reply.action?.type === "next-track") {
        const nowRes = await getNow();
        setNow(nowRes);
      } else if (reply.action?.type === "add-favorite" && reply.action.trackId) {
        setFavorites((prev) => {
          if (prev.some((f) => f.trackId === reply.action!.trackId)) return prev;
          return [...prev, {
            trackId: reply.action!.trackId!,
            title: reply.action!.title ?? "",
            artist: reply.action!.artist ?? "",
            favoritedAt: new Date().toISOString()
          }];
        });
      }
    } catch (chatError) {
      playback.setError(`发送失败：${getErrorMessage(chatError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (track === null) return;
    setIsActing(true);
    try {
      if (isFavorited) {
        await removeFavorite(track.id);
        setFavorites((prev) => prev.filter((f) => f.trackId !== track.id));
      } else {
        const favPayload: { trackId: string; title: string; artist: string; album?: string } = { trackId: track.id, title: track.title, artist: track.artist };
        if (track.album !== undefined) favPayload.album = track.album;
        const { favorite } = await addFavorite(favPayload);
        setFavorites((prev) => [...prev, { ...favorite, title: track.title, artist: track.artist, album: track.album }]);
      }
    } catch (favError) {
      playback.setError(`收藏操作失败：${getErrorMessage(favError)}`);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <main className="radio-page">
      <header className="topbar">
        <a className="brand" href="/">FakeRadio</a>
        <nav aria-label="FakeRadio views" className="nav-links">
          <a href="/profile">Profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="player-panel" aria-labelledby="player-title">
        <div className="player-copy">
          <p className="section-label">本地个人音乐电台</p>
          <h1 id="player-title">
            {playback.episodeData?.track.title ?? track?.title ?? "等待开播"}
            {track !== null ? (
              <button
                type="button"
                className="favorite-toggle"
                onClick={handleToggleFavorite}
                disabled={isActing}
                aria-label={isFavorited ? "取消收藏" : "收藏"}
                style={{ marginLeft: "0.5em", background: "none", border: "none", cursor: "pointer", fontSize: "1.2em" }}
              >
                {isFavorited ? "★" : "☆"}
              </button>
            ) : null}
          </h1>
          <p className="artist-line">
            {playback.episodeData !== null
              ? `${playback.episodeData.track.artist} · ${getStoryTypeLabel(playback.episodeData.story.type)} · ${getTrackSourceLabel(playback.episodeData.track.source)}`
              : track === null
                ? "FakeRadio 已准备好"
                : `${track.artist} · ${formatDuration(track.durationMs)} · ${getTrackSourceLabel(track.source)}`}
          </p>
        </div>

        <div className="status-strip" aria-label="播放状态">
          <span>{playback.episodeState !== "idle" ? playback.episodeStateLabel : playbackLabel}</span>
          <span>{streamStatus.label}</span>
          <span>{getProviderStatusLabel(musicStatus)}</span>
          <span>{isLoading ? "加载中" : "同步完成"}</span>
          {playback.nextEpisodeLabel !== "" ? <span>{playback.nextEpisodeLabel}</span> : null}
          {nextResult?.diagnostics?.candidateSource && (
            <span>来源: {nextResult.diagnostics.candidateSource}</span>
          )}
          {nextResult?.diagnostics?.rerankSource && (
            <span>重排: {nextResult.diagnostics.rerankSource}</span>
          )}
        </div>

        <audio ref={audio.musicRef} className="audio-control" controls preload="none" src={buildMediaUrl(playback.episodeData?.track.audioUrl ?? track?.audioUrl)} />
        <audio ref={audio.speechRef} preload="auto" style={{ display: "none" }} />

        <div className="button-row">
          <button type="button" className="primary-button" onClick={playback.playEpisode} disabled={playback.episodeState === "preparing"}>
            {playback.episodeState === "error" ? "重试播放" : playback.episodeState === "music" ? "重新收听" : "电台播放"}
          </button>
          <button type="button" onClick={handleNext} disabled={isActing}>生成下一首</button>
          <button type="button" onClick={handleRefresh} disabled={isActing}>刷新当前</button>
        </div>
      </section>

      {playback.error === null ? null : <p className="error-line">{playback.error}</p>}
      {shouldWarn ? <p className="error-line">当前音乐来源已回退到 mock，本地真实 provider 暂不可用。</p> : null}

      <section className="grid-layout" aria-label="电台运行信息">
        <article className="panel">
          <h2>DJ 口播</h2>
          <p className="speech">{now?.dj.say ?? playback.episodeData?.story.text ?? "等待 DJ 输出。"}</p>
          <dl className="detail-list">
            <div><dt>TTS</dt><dd>{now?.dj.audioUrl ?? playback.episodeData?.story.audioUrl ?? "尚未合成"}</dd></div>
            <div>
              <dt>故事类型</dt>
              <dd>
                {playback.episodeData !== null ? getStoryTypeLabel(playback.episodeData.story.type) : "—"}
                {playback.episodeData !== null && getStorySourceDescription(playback.episodeData.story.type) !== null ? (
                  <small style={{ display: "block", color: "var(--color-warning, #b08800)" }}>
                    {getStorySourceDescription(playback.episodeData.story.type)}
                  </small>
                ) : null}
              </dd>
            </div>
            <div><dt>Segue</dt><dd>{now?.dj.segue ?? "尚无过渡语"}</dd></div>
            <div><dt>Stream</dt><dd>{streamStatus.detail}</dd></div>
            <div><dt>Music Provider</dt><dd>{getProviderStatusLabel(musicStatus)}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <h2>队列</h2>
          <ol className="queue-list">
            {(now?.queue ?? []).map((queueTrack) => (
              <li key={queueTrack.id}>
                <span>{queueTrack.title}</span>
                <small>{queueTrack.artist} · {getTrackSourceLabel(queueTrack.source)}</small>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel">
          <h2>网易云登录</h2>
          <p>
            {neteaseLogin?.loggedIn
              ? `已登录${neteaseLogin.nickname ? `：${neteaseLogin.nickname}` : ""}`
              : neteaseLogin?.cookieStored
                ? "已保存 cookie，但登录状态需要重新确认。"
                : "尚未登录，当前可能只能拿到低码率试听源。"}
          </p>
          {neteaseLogin?.message ? <p className="story-source-hint">{neteaseLogin.message}</p> : null}
          {neteaseQr !== null ? (
            <div className="netease-login-box">
              <img src={neteaseQr.qrImageUrl} alt="网易云扫码登录二维码" />
              <button type="button" onClick={handleCheckNeteaseQr} disabled={isActing}>我已扫码，检查登录</button>
            </div>
          ) : (
            <button type="button" onClick={handleCreateNeteaseQr} disabled={isActing}>生成登录二维码</button>
          )}
          {neteaseMessage ? <p>{neteaseMessage}</p> : null}

          {!neteaseLogin?.loggedIn && (
            <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border, #ccc)" }}>
              <p className="section-label" style={{ marginBottom: "0.5rem" }}>手动注入 Cookie（扫码被封时备用）</p>
              <p style={{ fontSize: "0.85rem", color: "var(--color-muted, #888)", marginBottom: "0.5rem" }}>
                1) 在浏览器打开 music.163.com 并登录<br/>
                2) F12 → Application → Cookies → music.163.com → 复制 <code>MUSIC_U</code> 的值<br/>
                3) 格式：<code>MUSIC_U=xxxxxxxx</code>（可直接粘整段 cookie）
              </p>
              <textarea
                value={neteaseCookieInput}
                onChange={(e) => setNeteaseCookieInput(e.target.value)}
                placeholder="粘贴 cookie 字符串..."
                rows={3}
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
              <button type="button" onClick={handleSubmitCookie} disabled={isActing || neteaseCookieInput.trim().length === 0}>
                注入 Cookie
              </button>
            </div>
          )}
        </article>

        <article className="panel">
          <h2>和 DJ 聊</h2>
          <div className="chat-messages" style={{ maxHeight: "200px", overflowY: "auto", marginBottom: "0.5rem" }}>
            {agentMessages.map((msg, i) => (
              <p key={`${msg.trackId}-${i}`} className="speech" style={{ borderLeft: "3px solid var(--color-accent, #4a9)", paddingLeft: "0.5rem", margin: "0.25rem 0" }}>
                <small style={{ opacity: 0.6 }}>DJ </small>{msg.text}
              </p>
            ))}
            {chatReply !== null ? (
              <p className="speech" style={{ borderLeft: "3px solid var(--color-primary, #666)", paddingLeft: "0.5rem", margin: "0.25rem 0" }}>
                <small style={{ opacity: 0.6 }}>DJ </small>{chatReply.message}
              </p>
            ) : null}
          </div>
          <form className="chat-form" onSubmit={handleChat}>
            <label htmlFor="chat-message">消息</label>
            <textarea id="chat-message" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} placeholder="比如：来点适合写代码的 / 下一首 / 收藏" rows={3} />
            <button type="submit" disabled={isActing || chatMessage.trim().length === 0}>发送</button>
          </form>
        </article>

        <article className="panel">
          <h2>决策原因</h2>
          <p>{nextResult?.decision.reason ?? "生成下一首后显示模型决策原因。"}</p>
          <p>{nextResult?.decision.play.reason ?? "播放理由会显示在这里。"}</p>
          {playback.episodeData !== null ? (
            <>
              <h3>故事来源</h3>
              {getStorySourceDescription(playback.episodeData.story.type) !== null ? (
                <p className="story-source-hint">{getStorySourceDescription(playback.episodeData.story.type)}</p>
              ) : null}
              <ul className="source-list">
                {playback.episodeData.sources.map((source, index) => (
                  <li key={index}>
                    <strong>{source.title}</strong>
                    <small>{getSourceKindLabel(source.kind)}{source.confidence !== undefined ? ` (${Math.round(source.confidence * 100)}%)` : null}</small>
                    <p>{source.content}</p>
                  </li>
                ))}
              </ul>
              {playback.episodeData.fallbackReason !== undefined ? <p className="error-line">回退原因：{playback.episodeData.fallbackReason}</p> : null}
            </>
          ) : null}
        </article>

        <article className="panel">
          <h2>今日节奏</h2>
          <ol className="plan-list">
            {(plan?.blocks ?? []).map((block) => (
              <li key={`${block.at}-${block.label}`}>
                <time>{block.at}</time>
                <span>{block.label}</span>
                <small>{block.moodHint}</small>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel">
          <h2>品味摘要</h2>
          <p>{taste?.taste ?? "正在读取用户品味。"}</p>
          <p>{taste?.moodRules ?? "正在读取 mood rules。"}</p>
        </article>
      </section>
    </main>
  );
}
