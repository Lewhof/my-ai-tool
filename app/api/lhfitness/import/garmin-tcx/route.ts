// Parse a single Garmin TCX file (XML, one activity per file).
// TCX shape (simplified):
//   <TrainingCenterDatabase>
//     <Activities>
//       <Activity Sport="Running">
//         <Id>2026-04-26T14:30:01.000Z</Id>
//         <Lap StartTime="...">
//           <TotalTimeSeconds>2700.0</TotalTimeSeconds>
//           <DistanceMeters>5000.0</DistanceMeters>
//           <Calories>320</Calories>
//           <AverageHeartRateBpm><Value>148</Value></AverageHeartRateBpm>
//           <MaximumHeartRateBpm><Value>172</Value></MaximumHeartRateBpm>
//         </Lap>
//         ...
//       </Activity>
//     </Activities>
//   </TrainingCenterDatabase>
//
// We aggregate across laps and emit one ImportedWorkout per Activity.
// XML parsing is done with a tiny regex helper to avoid pulling in a 200KB XML lib.

interface ParsedWorkout {
  id: string;
  source: 'garmin_tcx';
  external_id?: string;
  date: string;
  type: string;
  duration_seconds?: number;
  distance_km?: number;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  raw: { sport: string; laps: number };
  imported_at: string;
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const matches: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) matches.push(m[1]);
  return matches;
}

function extractFirst(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]+)"`);
  const m = re.exec(xml);
  return m ? m[1] : undefined;
}

function parseFloatSafe(s: string | undefined): number | undefined {
  if (s === undefined || s === '') return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: 'File too large (20MB max)' }, { status: 400 });
    }
    const xml = await file.text();
    if (!xml.includes('<TrainingCenterDatabase')) {
      return Response.json({ error: 'Not a valid TCX file' }, { status: 400 });
    }

    const importedAt = new Date().toISOString();
    const activities = extractAll(xml, 'Activity');
    const workouts: ParsedWorkout[] = [];

    activities.forEach((activityXml, idx) => {
      const sport = extractAttr(activityXml, 'Activity', 'Sport') ||
                    extractAttr(`<Activity ${activityXml.split('>')[0]}>`, 'Activity', 'Sport') ||
                    'Other';
      const id = extractFirst(activityXml, 'Id');
      if (!id) return;

      // Aggregate across laps
      const laps = extractAll(activityXml, 'Lap');
      let totalSeconds = 0;
      let totalMeters = 0;
      let totalCalories = 0;
      let avgHrSum = 0;
      let avgHrCount = 0;
      let maxHr = 0;

      laps.forEach(lap => {
        totalSeconds += parseFloatSafe(extractFirst(lap, 'TotalTimeSeconds')) || 0;
        totalMeters += parseFloatSafe(extractFirst(lap, 'DistanceMeters')) || 0;
        totalCalories += parseFloatSafe(extractFirst(lap, 'Calories')) || 0;
        const avg = parseFloatSafe(extractFirst(lap, 'AverageHeartRateBpm') ? extractFirst(extractFirst(lap, 'AverageHeartRateBpm') || '', 'Value') : undefined);
        if (avg) { avgHrSum += avg; avgHrCount++; }
        const mx = parseFloatSafe(extractFirst(lap, 'MaximumHeartRateBpm') ? extractFirst(extractFirst(lap, 'MaximumHeartRateBpm') || '', 'Value') : undefined);
        if (mx && mx > maxHr) maxHr = mx;
      });

      workouts.push({
        id: 'imp-tcx-' + Date.now() + '-' + idx,
        source: 'garmin_tcx',
        external_id: id,
        date: id,
        type: sport,
        duration_seconds: totalSeconds > 0 ? Math.round(totalSeconds) : undefined,
        distance_km: totalMeters > 0 ? totalMeters / 1000 : undefined,
        calories: totalCalories > 0 ? Math.round(totalCalories) : undefined,
        avg_hr: avgHrCount > 0 ? Math.round(avgHrSum / avgHrCount) : undefined,
        max_hr: maxHr > 0 ? Math.round(maxHr) : undefined,
        raw: { sport, laps: laps.length },
        imported_at: importedAt,
      });
    });

    return Response.json({ workouts, parsed: workouts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TCX import failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
