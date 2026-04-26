// Parses a Garmin Connect Activities CSV export.
// Garmin's CSV has these typical columns:
//   Activity Type, Date, Favorite, Title, Distance, Calories, Time, Avg HR, Max HR,
//   Aerobic TE, Avg Run Cadence, Max Run Cadence, Avg Speed, Max Speed, Elev Gain, ...
// We only consume the universally useful fields and pass everything else into `raw`.

interface ParsedWorkout {
  id: string;
  source: 'garmin_csv';
  date: string;            // ISO datetime
  type: string;
  name?: string;
  duration_seconds?: number;
  distance_km?: number;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  elevation_m?: number;
  raw: Record<string, string>;
  imported_at: string;
}

// Minimal CSV parser — handles quoted fields with embedded commas. Avoids a dependency.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.some(c => c.length > 0)) rows.push(cur);
        cur = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    if (cur.some(c => c.length > 0)) rows.push(cur);
  }
  return rows;
}

// "00:45:32.0" or "00:45:32" or "45:32" → seconds
function parseDuration(s: string): number | undefined {
  if (!s || s === '--' || s === '0') return undefined;
  const clean = s.trim().replace(/,/g, '');
  const parts = clean.split(':').map(p => parseFloat(p));
  if (parts.some(p => isNaN(p))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return undefined;
}

function parseNum(s: string): number | undefined {
  if (!s || s === '--' || s.trim() === '') return undefined;
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

// Garmin "Distance" can be in km or mi depending on locale; we assume km (default Connect setting).
// Heuristic: if value > 200 and the activity is not Cycling, it's almost certainly metres.
function parseDistance(value: string, type: string): number | undefined {
  const n = parseNum(value);
  if (n === undefined) return undefined;
  if (n > 200 && !/cycl|bike|ride/i.test(type)) return n / 1000;
  return n;
}

// Garmin date is usually "2026-04-26 14:30:01" or ISO. Normalise to ISO.
function parseDate(s: string): string | undefined {
  if (!s) return undefined;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  // Garmin format "YYYY-MM-DD HH:MM:SS"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}.000Z`;
  }
  // US format "MM/DD/YYYY HH:MM:SS"
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m2) {
    return `${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}T${m2[4].padStart(2, '0')}:${m2[5]}:00.000Z`;
  }
  // Fall back to Date parser
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'File too large (10MB max)' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      return Response.json({ error: 'Empty or malformed CSV' }, { status: 400 });
    }

    const headers = rows[0].map(h => h.trim());
    const idx = (...names: string[]) => {
      for (const n of names) {
        const i = headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const iType = idx('Activity Type', 'Type');
    const iDate = idx('Date', 'Start Time', 'Activity Date');
    const iTitle = idx('Title', 'Activity Name', 'Name');
    const iDistance = idx('Distance');
    const iCalories = idx('Calories');
    const iTime = idx('Time', 'Duration', 'Total Time');
    const iAvgHR = idx('Avg HR', 'Average HR', 'Avg Heart Rate');
    const iMaxHR = idx('Max HR', 'Maximum HR', 'Max Heart Rate');
    const iElev = idx('Total Ascent', 'Elev Gain', 'Elevation Gain');

    const importedAt = new Date().toISOString();
    const workouts: ParsedWorkout[] = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.every(c => !c.trim())) continue;
      const date = iDate >= 0 ? parseDate(row[iDate]) : undefined;
      if (!date) { errors.push({ row: r + 1, reason: 'unparseable date' }); continue; }
      const type = (iType >= 0 ? row[iType] : 'Other').trim() || 'Other';
      const raw: Record<string, string> = {};
      headers.forEach((h, i) => { if (row[i] && row[i] !== '--') raw[h] = row[i]; });

      workouts.push({
        id: 'imp-' + Date.now() + '-' + r,
        source: 'garmin_csv',
        date,
        type,
        name: iTitle >= 0 ? row[iTitle] || undefined : undefined,
        duration_seconds: iTime >= 0 ? parseDuration(row[iTime]) : undefined,
        distance_km: iDistance >= 0 ? parseDistance(row[iDistance], type) : undefined,
        calories: iCalories >= 0 ? parseNum(row[iCalories]) : undefined,
        avg_hr: iAvgHR >= 0 ? parseNum(row[iAvgHR]) : undefined,
        max_hr: iMaxHR >= 0 ? parseNum(row[iMaxHR]) : undefined,
        elevation_m: iElev >= 0 ? parseNum(row[iElev]) : undefined,
        raw,
        imported_at: importedAt,
      });
    }

    return Response.json({ workouts, parsed: workouts.length, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'CSV import failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
