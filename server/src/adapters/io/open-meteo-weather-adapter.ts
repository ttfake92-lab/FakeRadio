import type { WeatherAdapter, WeatherSnapshot } from "../types.js";

// Open-Meteo 天气 adapter: 免费、无需 API key。
// 之前没有 OpenWeatherMap key 时天气直接 disabled,推荐和口播完全感知不到天气;
// 这个 adapter 让"自动识别天气"开箱即用——城市名一次地理编码后缓存坐标,
// 之后每次 current() 只打天气接口。

interface GeocodingResponse {
  results?: Array<{ latitude: number; longitude: number; name: string }>;
}

interface ForecastResponse {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
}

// WMO weather code → 中文天气描述。
// https://open-meteo.com/en/docs 的 WMO Weather interpretation codes 表。
function describeWeatherCode(code: number): string {
  if (code === 0) return "晴";
  if (code <= 2) return "多云间晴";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code === 85 || code === 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "未知天气";
}

// 与 openweathermap adapter 的 mapWeatherToMood 保持同一套 moodHint 语汇,
// 推荐引擎和 mood rules 对这些词已经有处理逻辑。
function mapCodeToMood(code: number): string {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "冷冽而深邃";
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return "纯净而轻盈";
  if (code === 3 || code === 45 || code === 48) return "柔和而内敛";
  return "温暖而明亮";
}

export function createOpenMeteoWeatherAdapter({
  city = "Shanghai",
  latitude,
  longitude,
  timeoutMs = 8000
}: {
  city?: string;
  latitude?: number;
  longitude?: number;
  timeoutMs?: number;
} = {}): WeatherAdapter {
  let coords: { latitude: number; longitude: number } | null =
    latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`[OpenMeteoWeather] request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function resolveCoords(): Promise<{ latitude: number; longitude: number }> {
    if (coords) return coords;
    const data = await fetchJson<GeocodingResponse>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
    );
    const hit = data.results?.[0];
    if (!hit) {
      throw new Error(`[OpenMeteoWeather] geocoding found no result for city "${city}"`);
    }
    coords = { latitude: hit.latitude, longitude: hit.longitude };
    return coords;
  }

  return {
    async current(): Promise<WeatherSnapshot> {
      const { latitude: lat, longitude: lon } = await resolveCoords();
      const data = await fetchJson<ForecastResponse>(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`
      );
      const code = data.current?.weather_code ?? -1;
      const snapshot: WeatherSnapshot = {
        summary: describeWeatherCode(code),
        moodHint: mapCodeToMood(code)
      };
      if (typeof data.current?.temperature_2m === "number") {
        snapshot.temperatureC = data.current.temperature_2m;
      }
      return snapshot;
    }
  };
}
