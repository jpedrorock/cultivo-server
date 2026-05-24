import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { createTestContext } from "./test-helpers";

// Mock global fetch
global.fetch = vi.fn();

describe("Weather Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch current weather data successfully", async () => {
    const mockWeatherData = {
      current: {
        temperature_2m: 25.5,
        relative_humidity_2m: 65,
        weather_code: 0,
        time: "2026-02-06T15:00:00",
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockWeatherData,
    });

    const caller = appRouter.createCaller(createTestContext());
    const result = await caller.weather.getCurrent({ lat: -15.7939, lon: -47.8828 });

    expect(result).toEqual({
      temperature: 25.5,
      humidity: 65,
      weatherCode: 0,
      time: "2026-02-06T15:00:00",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.open-meteo.com/v1/forecast")
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("latitude=-15.7939")
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("longitude=-47.8828")
    );
  });

  it("should throw error when API request fails", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.weather.getCurrent({ lat: -15.7939, lon: -47.8828 })
    ).rejects.toThrow("Failed to fetch weather data");
  });

  it("should handle different coordinates", async () => {
    const mockWeatherData = {
      current: {
        temperature_2m: 18.3,
        relative_humidity_2m: 72,
        weather_code: 1,
        time: "2026-02-06T16:00:00",
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockWeatherData,
    });

    const caller = appRouter.createCaller(createTestContext());
    const result = await caller.weather.getCurrent({ lat: -23.5505, lon: -46.6333 }); // São Paulo

    expect(result.temperature).toBe(18.3);
    expect(result.humidity).toBe(72);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("latitude=-23.5505")
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("longitude=-46.6333")
    );
  });
});
