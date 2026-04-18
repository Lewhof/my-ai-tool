import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface GeneratedRecipe {
  name: string;
  description: string;
  ingredients: Array<{ item: string; amount: string }>;
  instructions: string[];
  macros: { calories: number; protein_g: number; carbs_g: number; fiber_g: number; fat_g: number };
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
}

const SYSTEM = `You are a keto nutrition expert. Generate ONE original keto recipe in strict JSON format.

Rules:
- Net carbs (carbs_g - fiber_g) must be under 10g per serving
- High fat (55-75% of calories from fat)
- Moderate protein (20-30% of calories)
- Low carb (<10% of calories from carbs)
- Use whole foods: meat, fish, eggs, cheese, nuts, avocado, olive oil, leafy greens, cruciferous vegetables
- Avoid: grains, legumes, starchy vegetables, sugar, most fruit, seed oils
- Be realistic with macros — calculate from ingredient quantities

Return ONLY valid JSON matching this shape:
{
  "name": "string",
  "description": "1-2 sentence summary",
  "ingredients": [{"item": "string", "amount": "string (e.g. '200g' or '2 tbsp')"}],
  "instructions": ["step 1", "step 2", ...],
  "macros": {"calories": int, "protein_g": number, "carbs_g": number, "fiber_g": number, "fat_g": number},
  "servings": int,
  "prep_minutes": int,
  "cook_minutes": int
}

No markdown, no commentary — just the JSON object.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt as string)?.trim() || 'a quick, delicious keto meal I can make tonight';
  const mealType = body.meal_type as string | undefined;

  const userMsg = `${mealType ? `Meal type: ${mealType}. ` : ''}Request: ${prompt}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: 1500, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return Response.json({ error: `Gemini failed: ${res.status} ${errText.slice(0, 200)}` }, { status: 500 });
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return Response.json({ error: 'No recipe generated' }, { status: 500 });

  let recipe: GeneratedRecipe;
  try {
    recipe = JSON.parse(rawText);
  } catch {
    return Response.json({ error: 'Invalid recipe JSON from AI' }, { status: 500 });
  }

  // Validate net carbs for keto safety
  const netCarbs = Math.max(0, (recipe.macros?.carbs_g || 0) - (recipe.macros?.fiber_g || 0));
  const isKeto = netCarbs <= 10;

  // Persist (unsaved by default — user can bookmark)
  const { data: saved, error } = await supabaseAdmin.from('recipes').insert({
    user_id: userId,
    name: recipe.name,
    description: recipe.description,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    macros: recipe.macros,
    servings: recipe.servings,
    prep_minutes: recipe.prep_minutes,
    cook_minutes: recipe.cook_minutes,
    is_keto: isKeto,
    saved: false,
    source: 'ai',
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ recipe: saved, net_carbs: netCarbs });
}
