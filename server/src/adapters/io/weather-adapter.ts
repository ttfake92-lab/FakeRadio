import type { WeatherAdapter } from "../../adapters/types.js";
import type { WeatherSnapshot } from "../../adapters/types.js";

interface OpenWeatherMapResponse {
  weather: Array<{ description: string }>;
  main: { temp: number };
}

function mapWeatherToMood(data: OpenWeatherMapResponse): string {
  const desc = data.weather[0]?.description?.toLowerCase() ?? "";
  if (desc.includes("rain") || desc.includes("storm")) return "冷冽而深邃";
  if (desc.includes("cloud")) return "柔和而内敛";
  if (desc.includes("snow")) return "纯净而轻盈";
  return "温暖而明亮";
}

export function createWeatherAdapter({ apiKey, city = "Shanghai" }: { apiKey: string; city?: string }): WeatherAdapter {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("[WeatherAdapter] apiKey is required");
  }
  return {
    async current(): Promise<WeatherSnapshot> {
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`
        );
        if (!response.ok) {
          throw new Error(`[WeatherAdapter] API request failed with status ${response.status}`);
        }
        const data = (await response.json()) as unknown as OpenWeatherMapResponse;
        return {
          summary: data.weather[0]?.description ?? "unknown",
          moodHint: mapWeatherToMood(data),
          temperatureC: data.main.temp,
        };
      } catch (err) {
        throw new Error(
          `[WeatherAdapter] Failed to fetch weather: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
  };
}
