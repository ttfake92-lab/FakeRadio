import type { CalendarAdapter, DeviceAdapter, WeatherAdapter } from "../types.js";

export function createMockWeatherAdapter(): WeatherAdapter {
  return {
    async current() {
      return {
        summary: "晴，适合轻盈开场",
        moodHint: "warm and clear",
        temperatureC: 22
      };
    }
  };
}

export function createMockCalendarAdapter(): CalendarAdapter {
  return {
    async upcoming() {
      return [
        {
          title: "专注工作",
          start: "09:00",
          end: "12:00"
        }
      ];
    }
  };
}

export function createMockDeviceAdapter(): DeviceAdapter {
  return {
    async list() {
      return [
        {
          id: "local-browser",
          name: "Local Browser",
          kind: "browser",
          status: "available"
        }
      ];
    }
  };
}
