"use client";

import type { ChatResponse, EpisodeNextResponse, HealthResponse, NextResponse, NowResponse, RadioEpisode, StreamEvent, TasteResponse, TodayPlanResponse } from "@fakeradio/shared";
import { StreamEventSchema } from "@fakeradio/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMediaUrl, buildStreamUrl, getHealth, getNext, getNextEpisode, getNow, getTaste, getTodayPlan, sendChat } from "../../lib/api-client";
import {
  computeFadedVolume,
  formatDuration,
  getEpisodeStateLabel,
  getNextEpisodeLabel,
  getPlaybackLabel,
  getProviderStatusLabel,
  getSourceKindLabel,
  getStorySourceDescription,
  getStoryTypeLabel,
  getTrackSourceLabel,
  shouldStartCrossfade,
  shouldWarnOnMockMusic,
  transitEpisodeStateSafely
} from "./player-view-model";
import type { EpisodePlaybackState } from "./player-view-model";

type StreamStatus = {
  label: string;
  detail: string;
};

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
    dj: {
      say: result.decision.say,
      audioUrl: result.tts.audioUrl,
      segue: result.decision.segue
    },
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
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({
    label: "连接中",
    detail: "等待本地 stream"
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodeState, setEpisodeState] = useState<EpisodePlaybackState>("idle");
  const [episodeData, setEpisodeData] = useState<RadioEpisode | null>(null);
  const [nextEpisode, setNextEpisode] = useState<RadioEpisode | null>(null);
  const [nextEpisodeError, setNextEpisodeError] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);

  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const speechAudioRef = useRef<HTMLAudioElement>(null);
  const isDuckingRef = useRef(false);
  const nextEpisodeRef = useRef<RadioEpisode | null>(null);
  const isPrefetchingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeUpdateRef = useRef<(() => void) | null>(null);

  const track = now?.track ?? null;
  const playbackLabel = useMemo(() => getPlaybackLabel(now?.playback ?? "idle"), [now?.playback]);
  const musicStatus = getMusicStatus(health);
  const shouldWarn = shouldWarnOnMockMusic(musicStatus);
  const musicAudioUrl = buildMediaUrl(episodeData?.track.audioUrl ?? track?.audioUrl);
  const nextEpisodeLabel = useMemo(
    () => getNextEpisodeLabel(nextEpisodeError !== null, nextEpisode !== null, isPrefetching),
    [nextEpisodeError, nextEpisode, isPrefetching]
  );

  function fadeVolume(audio: HTMLAudioElement, targetVolume: number, durationMs: number) {
    const startVolume = audio.volume;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      audio.volume = computeFadedVolume(startVolume, targetVolume, durationMs, elapsed);
      if (elapsed < durationMs) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function restoreMusicVolume() {
    const musicAudio = musicAudioRef.current;
    if (musicAudio && isDuckingRef.current) {
      isDuckingRef.current = false;
      fadeVolume(musicAudio, 1.0, 300);
    }
  }

  function playEpisodeData(episode: RadioEpisode) {
    const speechAudio = speechAudioRef.current;
    const musicAudio = musicAudioRef.current;
    if (!speechAudio || !musicAudio) {
      setEpisodeState("error");
      setError("播放器未就绪");
      return;
    }

    setEpisodeData(episode);
    setEpisodeState("preparing");

    musicAudio.src = buildMediaUrl(episode.track.audioUrl) ?? "";
    musicAudio.volume = 0;

    speechAudio.src = buildMediaUrl(episode.story.audioUrl) ?? "";

    let crossfadeStarted = false;

    const onTimeUpdate = () => {
      if (crossfadeStarted) return;
      if (shouldStartCrossfade(speechAudio.currentTime, speechAudio.duration, episode.playback.crossfadeStartOffsetMs)) {
        crossfadeStarted = true;
        setEpisodeState((current) => transitEpisodeStateSafely(current, "CROSSFADE_START"));

        musicAudio.volume = episode.playback.musicStartVolume;
        musicAudio.play().catch(() => {});
        fadeVolume(musicAudio, 1.0, episode.playback.crossfadeStartOffsetMs);
      }
    };

    if (onTimeUpdateRef.current) {
      speechAudio.removeEventListener("timeupdate", onTimeUpdateRef.current);
    }
    speechAudio.addEventListener("timeupdate", onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;

    speechAudio.onended = () => {
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ENDED"));
      speechAudio.removeEventListener("timeupdate", onTimeUpdate);
      const ma = musicAudioRef.current;
      if (ma) {
        ma.volume = 1.0;
        ma.play().catch(() => {});
      }
    };

    speechAudio.onerror = () => {
      const ma = musicAudioRef.current;
      if (ma && !ma.paused) {
        fadeVolume(ma, 1.0, 300);
      }
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
      setError("口播加载失败");
      speechAudio.removeEventListener("timeupdate", onTimeUpdate);
    };

    musicAudio.onended = () => {
      const next = nextEpisodeRef.current;
      if (next) {
        nextEpisodeRef.current = null;
        setNextEpisode(null);
        setNextEpisodeError(null);
        playEpisodeData(next);
        return;
      }

      if (isPrefetchingRef.current) {
        const pollInterval = setInterval(() => {
          if (!isPrefetchingRef.current) {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            const n = nextEpisodeRef.current;
            if (n) {
              nextEpisodeRef.current = null;
              setNextEpisode(null);
              setNextEpisodeError(null);
              playEpisodeData(n);
            } else {
              setEpisodeState("idle");
            }
          }
        }, 100);
        pollIntervalRef.current = pollInterval;
        setTimeout(() => {
          if (pollIntervalRef.current === pollInterval) {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            setEpisodeState("idle");
          }
        }, 30_000);
        return;
      }

      setEpisodeState("idle");
    };

    speechAudio.play().then(() => {
      try {
        setEpisodeState((current) => transitEpisodeStateSafely(current, "LOAD_SUCCESS"));
      } catch {
        // state already changed, ignore
      }
    }).catch(() => {
      setEpisodeState((current) => transitEpisodeStateSafely(current, "SPEECH_ERROR"));
      setError("口播加载失败");
    });
  }

  async function playEpisode() {
    if (episodeState !== "idle" && episodeState !== "error" && episodeState !== "music") return;

    isPrefetchingRef.current = false;
    setIsPrefetching(false);
    nextEpisodeRef.current = null;
    setNextEpisode(null);
    setNextEpisodeError(null);

    setError(null);

    try {
      const response: EpisodeNextResponse = await getNextEpisode();
      playEpisodeData(response.episode);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid episode state transition")) {
        setEpisodeState("error");
        setError("状态转换异常，请刷新页面重试");
        return;
      }
      setEpisodeState("error");
      setEpisodeData(null);
      setError(`播放失败：${getErrorMessage(err)}`);
    }
  }

  const prefetchNextEpisode = useCallback(async () => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;
    setIsPrefetching(true);
    setNextEpisodeError(null);

    try {
      const response = await getNextEpisode();
      if (!isPrefetchingRef.current) return;
      nextEpisodeRef.current = response.episode;
      setNextEpisode(response.episode);
    } catch (err) {
      if (!isPrefetchingRef.current) return;
      nextEpisodeRef.current = null;
      setNextEpisode(null);
      setNextEpisodeError(getErrorMessage(err));
    } finally {
      isPrefetchingRef.current = false;
      setIsPrefetching(false);
    }
  }, []);

  useEffect(() => {
    if (episodeState === "music") {
      prefetchNextEpisode();
    }
  }, [episodeState, prefetchNextEpisode]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      const sa = speechAudioRef.current;
      if (sa && onTimeUpdateRef.current) {
        sa.removeEventListener("timeupdate", onTimeUpdateRef.current);
        onTimeUpdateRef.current = null;
      }
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nowResponse, tasteResponse, planResponse, healthResponse] = await Promise.all([
        getNow(),
        getTaste(),
        getTodayPlan(),
        getHealth()
      ]);
      setNow(nowResponse);
      setTaste(tasteResponse);
      setPlan(planResponse);
      setHealth(healthResponse);
    } catch (loadError) {
      setError(`无法连接本地服务：${getErrorMessage(loadError)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const socket = new WebSocket(buildStreamUrl("/stream"));

    socket.addEventListener("open", () => {
      setStreamStatus({
        label: "已连接",
        detail: "stream ready"
      });
    });

    socket.addEventListener("message", (message) => {
      const event = StreamEventSchema.parse(JSON.parse(String(message.data))) as StreamEvent;

      if (event.type === "now-playing") {
        setNow(event.payload);
      }

      if (event.type === "queue-updated") {
        setNow((current) => (current === null ? current : { ...current, queue: event.payload.queue }));
      }

      if (event.type === "dj-speech") {
        const musicAudio = musicAudioRef.current;
        const speechAudio = speechAudioRef.current;

        if (speechAudio && event.payload.audioUrl) {
          if (isDuckingRef.current) {
            restoreMusicVolume();
          }

          speechAudio.src = buildMediaUrl(event.payload.audioUrl) ?? "";
          speechAudio.onended = () => {
            restoreMusicVolume();
          };
          speechAudio.onerror = () => {
            restoreMusicVolume();
          };

          if (musicAudio && !musicAudio.paused) {
            isDuckingRef.current = true;
            fadeVolume(musicAudio, 0.2, 300);
          }

          speechAudio.play().catch(() => {
            restoreMusicVolume();
          });
        }

        const dj: NowResponse["dj"] = {
          say: event.payload.text
        };
        if (event.payload.audioUrl !== undefined) {
          dj.audioUrl = event.payload.audioUrl;
        }
        setNow((current) => (current === null ? current : { ...current, dj }));
      }

      if (event.type === "diagnostic") {
        setStreamStatus({
          label: event.payload.level,
          detail: event.payload.message
        });
      }
    });

    socket.addEventListener("error", () => {
      setStreamStatus({
        label: "异常",
        detail: "stream error"
      });
    });

    socket.addEventListener("close", () => {
      setStreamStatus({
        label: "已断开",
        detail: "stream closed"
      });
    });

    return () => {
      socket.close();
    };
  }, []);

  const handleRefresh = async () => {
    setIsActing(true);
    setError(null);

    try {
      setNow(await getNow());
      setHealth(await getHealth());
    } catch (refreshError) {
      setError(`刷新失败：${getErrorMessage(refreshError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleNext = async () => {
    setIsActing(true);
    setError(null);

    try {
      const result = await getNext();
      setNextResult(result);
      setNow(buildNowFromNext(result));
    } catch (nextError) {
      setError(`生成下一首失败：${getErrorMessage(nextError)}`);
    } finally {
      setIsActing(false);
    }
  };

  const handleChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatMessage.trim();

    if (message.length === 0) {
      return;
    }

    setIsActing(true);
    setError(null);

    try {
      const reply = await sendChat(message);
      setChatReply(reply);
      setChatMessage("");
    } catch (chatError) {
      setError(`发送失败：${getErrorMessage(chatError)}`);
    } finally {
      setIsActing(false);
    }
  };

  return (
    <main className="radio-page">
      <header className="topbar">
        <a className="brand" href="/">
          FakeRadio
        </a>
        <nav aria-label="FakeRadio views" className="nav-links">
          <a href="/profile">Profile</a>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="player-panel" aria-labelledby="player-title">
        <div className="player-copy">
          <p className="section-label">本地个人音乐电台</p>
          <h1 id="player-title">{episodeData?.track.title ?? track?.title ?? "等待开播"}</h1>
          <p className="artist-line">
            {episodeData !== null
              ? `${episodeData.track.artist} · ${getStoryTypeLabel(episodeData.story.type)} · ${getTrackSourceLabel(episodeData.track.source)}`
              : track === null
                ? "FakeRadio 已准备好"
                : `${track.artist} · ${formatDuration(track.durationMs)} · ${getTrackSourceLabel(track.source)}`}
          </p>
        </div>

        <div className="status-strip" aria-label="播放状态">
          <span>{episodeState !== "idle" ? getEpisodeStateLabel(episodeState) : playbackLabel}</span>
          <span>{streamStatus.label}</span>
          <span>{getProviderStatusLabel(musicStatus)}</span>
          <span>{isLoading ? "加载中" : "同步完成"}</span>
          {nextEpisodeLabel !== "" ? <span>{nextEpisodeLabel}</span> : null}
        </div>

        <audio
          ref={musicAudioRef}
          className="audio-control"
          controls
          preload="none"
          src={musicAudioUrl}
        />
        <audio ref={speechAudioRef} preload="auto" style={{ display: "none" }} />

        <div className="button-row">
          <button type="button" className="primary-button" onClick={playEpisode} disabled={episodeState === "preparing"}>
            {episodeState === "error" ? "重试播放" : episodeState === "music" ? "重新收听" : "电台播放"}
          </button>
          <button type="button" onClick={handleNext} disabled={isActing}>
            生成下一首
          </button>
          <button type="button" onClick={handleRefresh} disabled={isActing}>
            刷新当前
          </button>
        </div>
      </section>

      {error === null ? null : <p className="error-line">{error}</p>}
      {shouldWarn ? <p className="error-line">当前音乐来源已回退到 mock，本地真实 provider 暂不可用。</p> : null}

      <section className="grid-layout" aria-label="电台运行信息">
        <article className="panel">
          <h2>DJ 口播</h2>
          <p className="speech">{now?.dj.say ?? episodeData?.story.text ?? "等待 DJ 输出。"}</p>
          <dl className="detail-list">
            <div>
              <dt>TTS</dt>
              <dd>{now?.dj.audioUrl ?? episodeData?.story.audioUrl ?? "尚未合成"}</dd>
            </div>
            <div>
              <dt>故事类型</dt>
              <dd>
                {episodeData !== null ? getStoryTypeLabel(episodeData.story.type) : "—"}
                {episodeData !== null && getStorySourceDescription(episodeData.story.type) !== null ? (
                  <small style={{ display: "block", color: "var(--color-warning, #b08800)" }}>
                    {getStorySourceDescription(episodeData.story.type)}
                  </small>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Segue</dt>
              <dd>{now?.dj.segue ?? "尚无过渡语"}</dd>
            </div>
            <div>
              <dt>Stream</dt>
              <dd>{streamStatus.detail}</dd>
            </div>
            <div>
              <dt>Music Provider</dt>
              <dd>{getProviderStatusLabel(musicStatus)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>队列</h2>
          <ol className="queue-list">
            {(now?.queue ?? []).map((queueTrack) => (
              <li key={queueTrack.id}>
                <span>{queueTrack.title}</span>
                <small>
                  {queueTrack.artist} · {getTrackSourceLabel(queueTrack.source)}
                </small>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel">
          <h2>和 DJ 聊</h2>
          <form className="chat-form" onSubmit={handleChat}>
            <label htmlFor="chat-message">消息</label>
            <textarea
              id="chat-message"
              value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)}
              placeholder="比如：来点适合写代码的"
              rows={4}
            />
            <button type="submit" disabled={isActing || chatMessage.trim().length === 0}>
              发送
            </button>
          </form>
          <p className="speech">{chatReply?.message ?? "DJ 回复会显示在这里。"}</p>
        </article>

        <article className="panel">
          <h2>决策原因</h2>
          <p>{nextResult?.decision.reason ?? "生成下一首后显示模型决策原因。"}</p>
          <p>{nextResult?.decision.play.reason ?? "播放理由会显示在这里。"}</p>
          {episodeData !== null ? (
            <>
              <h3>故事来源</h3>
              {getStorySourceDescription(episodeData.story.type) !== null ? (
                <p className="story-source-hint">{getStorySourceDescription(episodeData.story.type)}</p>
              ) : null}
              <ul className="source-list">
                {episodeData.sources.map((source, index) => (
                  <li key={index}>
                    <strong>{source.title}</strong>
                    <small>
                      {getSourceKindLabel(source.kind)}
                      {source.confidence !== undefined ? ` (${Math.round(source.confidence * 100)}%)` : null}
                    </small>
                    <p>{source.content}</p>
                  </li>
                ))}
              </ul>
              {episodeData.fallbackReason !== undefined ? <p className="error-line">回退原因：{episodeData.fallbackReason}</p> : null}
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
