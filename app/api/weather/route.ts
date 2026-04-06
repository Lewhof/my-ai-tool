import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat') || '-26.2041';
  const lon = req.nextUrl.searchParams.get('lon') || '28.0473';

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`,
    { next: { revalidate: 1800 } }
  );

  if (!res.ok) {
    return Response.json({ error: 'Weather API failed' }, { status: 500 });
  }

  const data = await res.json();

  // Get location name via reverse geocoding
  let location = 'Your Location';
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1`
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.results?.[0]) {
        location = `${geoData.results[0].name}, ${geoData.results[0].country_code}`;
      }
    }
  } catch { /* use default */ }

  return Response.json({ ...data, location });
}
