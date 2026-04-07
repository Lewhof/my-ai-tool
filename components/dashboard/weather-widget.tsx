'use client';

import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Droplets, Wind, MapPin } from 'lucide-react';

interface WeatherData {
  location: string;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  current_units: {
    temperature_2m: string;
  };
}

function weatherInfo(code: number): { label: string; icon: typeof Sun } {
  if (code === 0) return { label: 'Clear sky', icon: Sun };
  if (code <= 3) return { label: 'Partly cloudy', icon: Cloud };
  if (code <= 48) return { label: 'Foggy', icon: Cloud };
  if (code <= 57) return { label: 'Drizzle', icon: CloudDrizzle };
  if (code <= 67) return { label: 'Rain', icon: CloudRain };
  if (code <= 77) return { label: 'Snow', icon: CloudSnow };
  if (code <= 82) return { label: 'Rain showers', icon: CloudRain };
  if (code <= 86) return { label: 'Snow showers', icon: CloudSnow };
  if (code <= 99) return { label: 'Thunderstorm', icon: CloudLightning };
  return { label: 'Unknown', icon: Cloud };
}

function dayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return new Date(dateStr).toLocaleDateString('en-ZA', { weekday: 'short' });
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        if (res.ok) {
          const data = await res.json();
          setWeather(data);
          localStorage.setItem('weather_cache', JSON.stringify({ data, ts: Date.now() }));
        }
      } catch {
        setError('Could not load weather');
      }
    };

    // Check cache first (30 min)
    const cached = localStorage.getItem('weather_cache');
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < 1800000) {
        setWeather(data);
        return;
      }
    }

    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(-26.2041, 28.0473) // Default: Johannesburg
      );
    } else {
      fetchWeather(-26.2041, 28.0473);
    }
  }, []);

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <p className="text-muted-foreground text-sm">Loading weather...</p>
      </div>
    );
  }

  const current = weather.current;
  const { label, icon: WeatherIcon } = weatherInfo(current.weather_code);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-5">
        {/* Current weather */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-2">
              <MapPin size={12} />
              <span>{weather.location}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-foreground">
                {Math.round(current.temperature_2m)}°
              </span>
              <span className="text-muted-foreground text-sm">
                Feels {Math.round(current.apparent_temperature)}°
              </span>
            </div>
            <p className="text-foreground text-sm mt-1">{label}</p>
          </div>
          <WeatherIcon size={40} className="text-primary" />
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Droplets size={14} />
            <span>{current.relative_humidity_2m}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Wind size={14} />
            <span>{Math.round(current.wind_speed_10m)} km/h</span>
          </div>
        </div>
      </div>

      {/* Forecast */}
      <div className="border-t border-border grid grid-cols-4 divide-x divide-border">
        {weather.daily.time.slice(0, 4).map((date, i) => {
          const { icon: DayIcon } = weatherInfo(weather.daily.weather_code[i]);
          return (
            <div key={date} className="py-3 px-2 text-center">
              <p className="text-muted-foreground text-xs mb-1">{dayName(date, i)}</p>
              <DayIcon size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-foreground text-xs font-medium">
                {Math.round(weather.daily.temperature_2m_max[i])}°
              </p>
              <p className="text-muted-foreground text-xs">
                {Math.round(weather.daily.temperature_2m_min[i])}°
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
