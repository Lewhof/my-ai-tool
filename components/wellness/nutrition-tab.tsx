'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Trash2, Sparkles, Loader2, Bookmark, BookmarkCheck, X, Beef, Clock } from 'lucide-react';

interface Meal {
  id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  fat_g: number | null;
  is_keto: boolean;
  source: string;
}

interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Array<{ item: string; amount: string }>;
  instructions: string[];
  macros: { calories: number; protein_g: number; carbs_g: number; fiber_g: number; fat_g: number };
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  is_keto: boolean;
  saved: boolean;
}

const MEAL_TYPES: Array<{ key: Meal['meal_type']; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

// Default keto targets — user can tweak later if we add settings
const TARGET_NET_CARBS = 20;
const TARGET_PROTEIN = 100;
const TARGET_FAT = 130;

export default function NutritionTab() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [recipeModal, setRecipeModal] = useState<Recipe | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [section, setSection] = useState<'today' | 'recipes'>('today');

  // Add-meal form state
  const [mType, setMType] = useState<Meal['meal_type']>('breakfast');
  const [mName, setMName] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mCal, setMCal] = useState('');
  const [mProtein, setMProtein] = useState('');
  const [mCarbs, setMCarbs] = useState('');
  const [mFiber, setMFiber] = useState('');
  const [mFat, setMFat] = useState('');

  const fetchMeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wellness/meals?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setMeals(data.meals ?? []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, [date]);

  const fetchSavedRecipes = useCallback(async () => {
    try {
      const res = await fetch('/api/wellness/recipes?saved=true');
      if (res.ok) {
        const data = await res.json();
        setSavedRecipes(data.recipes ?? []);
      }
    } catch { /* skip */ }
  }, []);

  useEffect(() => { fetchMeals(); }, [fetchMeals]);
  useEffect(() => { if (section === 'recipes') fetchSavedRecipes(); }, [section, fetchSavedRecipes]);

  const addMeal = async () => {
    if (!mName.trim()) { toast.error('Name required'); return; }
    const res = await fetch('/api/wellness/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date, meal_type: mType, name: mName.trim(),
        description: mDesc || null,
        calories: mCal ? Number(mCal) : null,
        protein_g: mProtein ? Number(mProtein) : null,
        carbs_g: mCarbs ? Number(mCarbs) : null,
        fiber_g: mFiber ? Number(mFiber) : null,
        fat_g: mFat ? Number(mFat) : null,
      }),
    });
    if (res.ok) {
      toast.success('Meal logged');
      setMName(''); setMDesc(''); setMCal(''); setMProtein(''); setMCarbs(''); setMFiber(''); setMFat('');
      setShowAdd(false);
      fetchMeals();
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      toast.error(err.error || 'Failed');
    }
  };

  const deleteMeal = async (id: string) => {
    const res = await fetch(`/api/wellness/meals?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Removed');
      fetchMeals();
    }
  };

  const generateRecipe = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/wellness/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: generatePrompt.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecipeModal(data.recipe);
        if (data.recipe && !data.recipe.is_keto) {
          toast('Net carbs > 10g — not strict keto', { description: 'Regenerate if you want a stricter option' });
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast.error(err.error || 'Failed to generate recipe');
      }
    } finally {
      setGenerating(false);
    }
  };

  const toggleSaveRecipe = async (recipe: Recipe) => {
    const res = await fetch('/api/wellness/recipes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recipe.id, saved: !recipe.saved }),
    });
    if (res.ok) {
      const data = await res.json();
      if (recipeModal?.id === recipe.id) setRecipeModal(data.recipe);
      setSavedRecipes(prev => prev.filter(r => r.id !== recipe.id).concat(data.recipe.saved ? [data.recipe] : []));
      toast.success(data.recipe.saved ? 'Recipe saved' : 'Removed from saved');
    }
  };

  const logRecipeAsMeal = async (recipe: Recipe, mealType: Meal['meal_type']) => {
    const res = await fetch('/api/wellness/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        meal_type: mealType,
        name: recipe.name,
        description: recipe.description,
        calories: recipe.macros.calories,
        protein_g: recipe.macros.protein_g,
        carbs_g: recipe.macros.carbs_g,
        fiber_g: recipe.macros.fiber_g,
        fat_g: recipe.macros.fat_g,
        is_keto: recipe.is_keto,
        source: 'recipe',
        recipe_id: recipe.id,
      }),
    });
    if (res.ok) {
      toast.success('Logged from recipe');
      setRecipeModal(null);
      fetchMeals();
    }
  };

  // Daily totals
  const totals = meals.reduce(
    (acc, m) => ({
      cal: acc.cal + (m.calories || 0),
      protein: acc.protein + (m.protein_g || 0),
      carbs: acc.carbs + (m.carbs_g || 0),
      fiber: acc.fiber + (m.fiber_g || 0),
      fat: acc.fat + (m.fat_g || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 }
  );
  const netCarbs = Math.max(0, totals.carbs - totals.fiber);

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setSection('today')}
          className={cn(
            'px-3 py-1.5 rounded text-xs font-medium transition-colors',
            section === 'today' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Today
        </button>
        <button
          onClick={() => setSection('recipes')}
          className={cn(
            'px-3 py-1.5 rounded text-xs font-medium transition-colors',
            section === 'recipes' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Saved Recipes
        </button>
      </div>

      {section === 'today' && (
        <>
          {/* Date + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
            />
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="flex items-center gap-1.5 bg-primary text-foreground px-3 py-1.5 rounded text-sm font-medium"
            >
              <Plus size={14} />
              Log meal
            </button>
            <div className="flex-1 min-w-[200px]" />
            <div className="flex gap-2 items-center">
              <input
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="e.g. quick lunch with chicken"
                className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground w-64"
                onKeyDown={(e) => e.key === 'Enter' && !generating && generateRecipe()}
              />
              <button
                onClick={generateRecipe}
                disabled={generating}
                className="flex items-center gap-1.5 bg-primary/20 text-primary border border-primary/40 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Suggest keto recipe
              </button>
            </div>
          </div>

          {/* Macros summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <MacroCard label="Calories" value={totals.cal} unit="kcal" />
            <MacroCard label="Net carbs" value={netCarbs} unit="g" target={TARGET_NET_CARBS} warn={netCarbs > TARGET_NET_CARBS} />
            <MacroCard label="Protein" value={totals.protein} unit="g" target={TARGET_PROTEIN} />
            <MacroCard label="Fat" value={totals.fat} unit="g" target={TARGET_FAT} />
            <MacroCard label="Fiber" value={totals.fiber} unit="g" />
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-foreground font-semibold text-sm">Log a meal</h3>
                <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select value={mType} onChange={(e) => setMType(e.target.value as Meal['meal_type'])} className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground">
                  {MEAL_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Name (e.g. Bacon & eggs)" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground col-span-1 sm:col-span-3" />
              </div>
              <input value={mDesc} onChange={(e) => setMDesc(e.target.value)} placeholder="Notes (optional)" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground w-full" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <LabeledInput label="Calories" unit="kcal" value={mCal} onChange={setMCal} />
                <LabeledInput label="Protein" unit="g" value={mProtein} onChange={setMProtein} />
                <LabeledInput label="Carbs" unit="g" value={mCarbs} onChange={setMCarbs} />
                <LabeledInput label="Fiber" unit="g" value={mFiber} onChange={setMFiber} />
                <LabeledInput label="Fat" unit="g" value={mFat} onChange={setMFat} />
              </div>
              <button onClick={addMeal} className="bg-primary text-foreground px-4 py-1.5 rounded text-sm font-medium">Save meal</button>
            </div>
          )}

          {/* Meals list */}
          <div className="space-y-2">
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : meals.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Beef size={24} className="mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground text-sm">No meals logged for this day.</p>
              </div>
            ) : (
              meals.map(m => (
                <div key={m.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                  <div className="shrink-0 w-20 text-xs text-muted-foreground uppercase tracking-wide">{m.meal_type}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-medium">{m.name}</p>
                    {m.description && <p className="text-muted-foreground text-xs truncate">{m.description}</p>}
                    <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                      {m.calories != null && <span>{m.calories} kcal</span>}
                      {m.protein_g != null && <span>P {m.protein_g}g</span>}
                      {m.carbs_g != null && <span>C {m.carbs_g}g{m.fiber_g != null && ` (net ${Math.max(0, m.carbs_g - m.fiber_g).toFixed(1)})`}</span>}
                      {m.fat_g != null && <span>F {m.fat_g}g</span>}
                      {!m.is_keto && <span className="text-yellow-400">non-keto</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteMeal(m.id)} className="text-muted-foreground hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {section === 'recipes' && (
        <div className="space-y-2">
          {savedRecipes.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <Sparkles size={24} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground text-sm">No saved recipes yet. Generate one from the Today tab and bookmark it.</p>
            </div>
          ) : (
            savedRecipes.map(r => (
              <button
                key={r.id}
                onClick={() => setRecipeModal(r)}
                className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BookmarkCheck size={14} className="text-primary" />
                  <p className="text-foreground text-sm font-medium flex-1">{r.name}</p>
                  <span className="text-[11px] text-muted-foreground">{r.macros.calories} kcal · net {Math.max(0, r.macros.carbs_g - r.macros.fiber_g).toFixed(1)}g</span>
                </div>
                {r.description && <p className="text-muted-foreground text-xs mt-1 line-clamp-1">{r.description}</p>}
              </button>
            ))
          )}
        </div>
      )}

      {/* Recipe modal */}
      {recipeModal && (
        <RecipeModal
          recipe={recipeModal}
          onClose={() => setRecipeModal(null)}
          onSave={() => toggleSaveRecipe(recipeModal)}
          onLog={(mealType) => logRecipeAsMeal(recipeModal, mealType)}
        />
      )}
    </div>
  );
}

function MacroCard({ label, value, unit, target, warn }: { label: string; value: number; unit: string; target?: number; warn?: boolean }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className={cn('bg-card border rounded-lg p-3', warn ? 'border-red-500/40' : 'border-border')}>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums', warn ? 'text-red-400' : 'text-foreground')}>
        {value.toFixed(unit === 'kcal' ? 0 : 1)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      {target && (
        <div className="mt-1 h-1 bg-border rounded overflow-hidden">
          <div className={cn('h-full', warn ? 'bg-red-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {target && <p className="text-[10px] text-muted-foreground mt-0.5">target {target}{unit}</p>}
    </div>
  );
}

function LabeledInput({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-muted-foreground text-[10px] uppercase tracking-wider block mb-0.5">{label} ({unit})</label>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-secondary border border-border rounded px-2 py-1 text-sm text-foreground w-full"
      />
    </div>
  );
}

function RecipeModal({ recipe, onClose, onSave, onLog }: {
  recipe: Recipe;
  onClose: () => void;
  onSave: () => void;
  onLog: (mealType: Meal['meal_type']) => void;
}) {
  const netCarbs = Math.max(0, (recipe.macros.carbs_g || 0) - (recipe.macros.fiber_g || 0));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-bold text-lg">{recipe.name}</h3>
            {recipe.description && <p className="text-muted-foreground text-sm mt-0.5">{recipe.description}</p>}
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Clock size={11} /> {recipe.prep_minutes + recipe.cook_minutes} min total</span>
              <span>{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</span>
              <span className="text-foreground">{recipe.macros.calories} kcal</span>
              <span className={cn(netCarbs > 10 ? 'text-yellow-400' : 'text-green-400')}>net {netCarbs.toFixed(1)}g carbs</span>
              <span>P {recipe.macros.protein_g}g · F {recipe.macros.fat_g}g</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <h4 className="text-foreground font-semibold text-sm mb-2">Ingredients</h4>
            <ul className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-sm text-foreground flex gap-2">
                  <span className="text-muted-foreground tabular-nums min-w-[80px]">{ing.amount}</span>
                  <span>{ing.item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-foreground font-semibold text-sm mb-2">Instructions</h4>
            <ol className="space-y-2">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="text-sm text-foreground flex gap-3">
                  <span className="text-muted-foreground font-mono w-5 shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex flex-wrap gap-2">
          <button
            onClick={onSave}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border',
              recipe.saved ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-foreground hover:bg-secondary'
            )}
          >
            {recipe.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {recipe.saved ? 'Saved' : 'Save'}
          </button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground self-center">Log as:</span>
          {MEAL_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => onLog(t.key)}
              className="px-3 py-1.5 rounded text-sm font-medium bg-secondary border border-border hover:border-primary/40"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
