import type { CalendarAdapter, DeviceAdapter, WeatherAdapter } from "../types.js";

export function createDisabledWeatherAdapter(): WeatherAdapter {
  return {
    async current() {
      return {
        summary: "weather provider disabled",
        moodHint: ""
      };
    }
  };
}

export function createDisabledCalendarAdapter(): CalendarAdapter {
  return {
    async upcoming() {
      return [];
    }
  };
}

export function createLocalBrowserDeviceAdapter(): DeviceAdapter {
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
