import React, { useEffect, useMemo, useRef, useState } from "react";

// Recipe Ideas – Deep Dive, Production-Quality Single-File App
// Now with: fuzzy suggestions, "Did you mean" corrections, suggestion dropdown, and improved UX.

/*************************
 * API Helpers
 *************************/
const API = {
  filterByIngredient: (i) =>
    `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(
      i
    )}`,
  filterByCategory: (c) =>
    `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(
      c
    )}`,
  filterByArea: (a) =>
    `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(
      a
    )}`,
  listCategories: `https://www.themealdb.com/api/json/v1/1/list.php?c=list`,
  listAreas: `https://www.themealdb.com/api/json/v1/1/list.php?a=list`,
  lookup: (id) => `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`,
  random: `https://www.themealdb.com/api/json/v1/1/random.php`,
};

// Simple in-memory caches to avoid refetching
const cache = {
  ingredient: new Map(), // key: ingredient -> meals[]
  category: new Map(), // key: category -> meals[]
  area: new Map(), // key: area -> meals[]
  lookup: new Map(), // key: id -> meal
};

/*************************
 * Utilities & Hooks
 *************************/
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function PlaceholderImgSVG({ label = "No image" }) {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><rect width='100%' height='100%' fill='#f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#64748b' font-size='20' font-family='Arial, Helvetica, sans-serif'>${label}</text></svg>`
  );
  return `data:image/svg+xml;utf8,${svg}`;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow">
      <div className="h-40 w-full animate-pulse bg-gray-200" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
      {children}
    </span>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-gray-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/*************************
 * Fuzzy helpers (lightweight)
 *************************/
// Levenshtein distance
function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

// Score: lower is better. We combine contains + edit distance ratio
function scoreMatch(query, target) {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!q || !t) return Infinity;
  if (t.includes(q)) return 0; // exact contain
  const dist = levenshtein(q, t);
  // normalized by length
  return dist / Math.max(t.length, 1);
}

/*************************
 * Data functions
 *************************/
const fetchJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error");
  return res.json();
};

async function fetchListCached(kind, key, url) {
  const store = cache[kind];
  if (store.has(key)) return store.get(key);
  const data = await fetchJSON(url);
  const meals = data?.meals || [];
  store.set(key, meals);
  return meals;
}

function intersectById(arrays) {
  if (!arrays.length) return [];
  return arrays.reduce((acc, curr) => {
    const set = new Set(curr.map((m) => m.idMeal));
    return acc.filter((m) => set.has(m.idMeal));
  });
}

/*************************
 * UI atoms
 *************************/
function RecipeCard({ meal, onOpen, fav, onToggleFav }) {
  const imgSrc = meal.strMealThumb || PlaceholderImgSVG({ label: "Recipe" });
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white text-left shadow hover:shadow-lg">
      <button
        onClick={() => onOpen(meal.idMeal)}
        className="w-full text-left focus:outline-none"
      >
        <div className="relative">
          <img
            src={imgSrc}
            alt={meal.strMeal}
            onError={(e) =>
              (e.currentTarget.src = PlaceholderImgSVG({
                label: "Image unavailable",
              }))
            }
            className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 text-base font-semibold text-gray-900">
            {meal.strMeal}
          </h3>
        </div>
      </button>
      <button
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        onClick={() => onToggleFav(meal.idMeal)}
        className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow hover:bg-white"
        title={fav ? "Remove favorite" : "Add favorite"}
      >
        {fav ? "❤️" : "🤍"}
      </button>
    </div>
  );
}

/*************************
 * App
 *************************/
export default function App() {
  // Inputs & filters
  const [ingredientInput, setIngredientInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedArea, setSelectedArea] = useState("");

  // Lists for dropdowns
  const [categories, setCategories] = useState([]);
  const [areas, setAreas] = useState([]);

  // Trending & results
  const [trending, setTrending] = useState([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // UX state
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const [sort, setSort] = useState("name-asc");
  const [favorites, setFavorites] = useLocalStorage("ri:favorites", []);
  const hasSearchedRef = useRef(false);

  // Details modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));

  const sortedResults = useMemo(() => {
    const copy = [...results];
    if (sort === "name-asc")
      copy.sort((a, b) => a.strMeal.localeCompare(b.strMeal));
    if (sort === "name-desc")
      copy.sort((a, b) => b.strMeal.localeCompare(a.strMeal));
    return copy;
  }, [results, sort]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedResults.slice(start, start + PAGE_SIZE);
  }, [page, sortedResults]);

  const isFav = (id) => favorites.includes(id);
  const toggleFav = (id) =>
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // Build a source list for suggestions: trending names, categories, areas, and any cached ingredient keys
  function buildSourceList() {
    const names = new Set();
    trending.forEach((t) => names.add(t.strMeal));
    categories.forEach((c) => names.add(c));
    areas.forEach((a) => names.add(a));
    // include cached ingredient keys
    cache.ingredient.forEach((_, k) => names.add(k));
    // add some popular fallbacks
    ["biryani", "pasta", "pizza", "curry", "salad", "fried rice"].forEach((p) =>
      names.add(p)
    );
    return Array.from(names);
  }

  // Suggestion logic: return top matches by score (lower is better)
  function getSuggestions(query) {
    if (!query || query.trim().length < 1) return [];
    const src = buildSourceList();
    const scored = src
      .map((s) => ({ s, score: scoreMatch(query, s) }))
      .filter((x) => isFinite(x.score))
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map((x) => x.s);
    return scored;
  }

  // Load dropdowns & trending on mount
  useEffect(() => {
    (async () => {
      try {
        const [cRes, aRes] = await Promise.all([
          fetchJSON(API.listCategories),
          fetchJSON(API.listAreas),
        ]);
        setCategories((cRes?.meals || []).map((m) => m.strCategory));
        setAreas((aRes?.meals || []).map((m) => m.strArea));
      } catch {
        // non-blocking
      }
    })();

    (async () => {
      setTrendingLoading(true);
      try {
        // Fetch multiple random meals, dedupe by id
        const calls = Array.from({ length: 8 }, () => fetchJSON(API.random));
        const packs = await Promise.all(calls);
        const merged = packs.flatMap((p) => p.meals || []);
        const map = new Map();
        merged.forEach((m) => map.set(m.idMeal, m));
        setTrending(Array.from(map.values()));
      } catch {
        setTrending([]);
      } finally {
        setTrendingLoading(false);
      }
    })();
  }, []);

  // Update suggestions on input change
  useEffect(() => {
    const sug = getSuggestions(ingredientInput);
    setSuggestions(sug);
  }, [ingredientInput, trending, categories, areas]);

  async function handleSearch(term = null) {
    const queryTerm = term !== null ? term : ingredientInput;
    setPage(1);
    setError("");
    setLoading(true);
    hasSearchedRef.current = true;
    setShowSuggestions(false);

    try {
      const ingredients = queryTerm
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const lists = [];

      if (ingredients.length) {
        const ingredientLists = await Promise.all(
          ingredients.map((ing) => {
            const key = ing.toLowerCase();
            return fetchListCached(
              "ingredient",
              key,
              API.filterByIngredient(key)
            );
          })
        );
        lists.push(intersectById(ingredientLists));
      }
      if (selectedCategory) {
        const key = selectedCategory;
        lists.push(
          await fetchListCached("category", key, API.filterByCategory(key))
        );
      }
      if (selectedArea) {
        const key = selectedArea;
        lists.push(await fetchListCached("area", key, API.filterByArea(key)));
      }

      let merged = [];
      if (!lists.length) {
        // No filters given — show trending as results
        merged = trending;
      } else if (lists.length === 1) {
        merged = lists[0];
      } else {
        merged = intersectById(lists);
      }

      // Deduplicate
      const map = new Map();
      merged.forEach((m) => map.set(m.idMeal, m));
      const deduped = Array.from(map.values());

      setResults(deduped);
      if (!deduped.length) {
        // If no results, compute best suggestion and show 'Did you mean'
        const src = buildSourceList();
        const scored = src
          .map((s) => ({ s, score: scoreMatch(queryTerm, s) }))
          .sort((a, b) => a.score - b.score);
        const best = scored[0];
        if (
          best &&
          best.score < 0.4 &&
          best.s.toLowerCase() !== queryTerm.toLowerCase()
        ) {
          setError("");
          setTimeout(() => {
            // show friendly message with suggestion
            setError(
              `No results for "${queryTerm}". Did you mean "${best.s}"? Click the suggestion to search.`
            );
          }, 100);
        } else {
          setError("No recipes found. Try different filters.");
        }
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openDetails(id) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      if (cache.lookup.has(id)) {
        const meal = cache.lookup.get(id);
        setDetail(enrichMeal(meal));
        setDetailLoading(false);
        return;
      }
      const data = await fetchJSON(API.lookup(id));
      const meal = data?.meals?.[0];
      if (!meal) throw new Error("Not found");
      cache.lookup.set(id, meal);
      setDetail(enrichMeal(meal));
    } catch {
      setDetail({ _error: true });
    } finally {
      setDetailLoading(false);
    }
  }

  function enrichMeal(meal) {
    const ing = [];
    for (let i = 1; i <= 20; i++) {
      const name = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      if (name && name.trim())
        ing.push(`${name}${measure ? ` – ${measure}` : ""}`);
    }
    return { ...meal, _ingredients: ing };
  }

  function resetToTrending() {
    setIngredientInput("");
    setSelectedCategory("");
    setSelectedArea("");
    setResults(trending);
    setError("");
    setPage(1);
    hasSearchedRef.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Allow Enter key to trigger search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") handleSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Suggestion click handler
  function handleSuggestionClick(s) {
    setIngredientInput(s);
    setShowSuggestions(false);
    handleSearch(s);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-end md:justify-between">
          <div className="cursor-pointer" onClick={resetToTrending}>
            <h1 className="text-2xl font-extrabold md:text-3xl">
              🍽️ Recipe Ideas
            </h1>
            <p className="text-sm text-gray-600">
              Find meals by ingredients, category, and cuisine.
            </p>
          </div>
          <div className="relative flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            <div className="relative w-full md:w-80">
              <input
                value={ingredientInput}
                onChange={(e) => {
                  setIngredientInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Ingredient(s), e.g. chicken, garlic"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-2 z-50 max-h-48 overflow-auto rounded-xl bg-white p-2 shadow-lg">
                  {suggestions.map((s, i) => (
                    <li key={s}>
                      <button
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => handleSuggestionClick(s)}
                        className="w-full text-left px-3 py-2 rounded hover:bg-emerald-50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <select
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="">Cuisine / Area</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => handleSearch()}
                className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white shadow hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                Search
              </button>
              <button
                onClick={resetToTrending}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        {/* Quick picks */}
        {!hasSearchedRef.current && (
          <section className="mb-6 rounded-2xl border bg-white p-4 shadow-sm md:p-6">
            <h2 className="mb-2 text-lg font-semibold">Quick picks</h2>
            <p className="text-sm text-gray-700">
              Type an ingredient and hit{" "}
              <span className="font-semibold">Search</span>. Multiple
              ingredients use logical <em>AND</em> (must include all).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["chicken", "egg", "rice", "tomato", "beef", "cheese"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setIngredientInput(t);
                      setTimeout(() => handleSearch(t), 0);
                    }}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  >
                    {t}
                  </button>
                )
              )}
              <button
                onClick={async () => {
                  setLoading(true);
                  setError("");
                  hasSearchedRef.current = true;
                  try {
                    const d = await fetchJSON(API.random);
                    setResults(d.meals || []);
                  } catch {
                    setError("Could not load a random recipe. Try again.");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-emerald-200 hover:bg-gray-50"
              >
                Surprise me 🎲
              </button>
            </div>
          </section>
        )}

        {/* Loading & Errors */}
        {loading && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}
        {error && (
          <div className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {!loading && !error && results.length > 0 && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-700">
                Showing <span className="font-semibold">{results.length}</span>{" "}
                recipe{results.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-600">Sort</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 shadow-sm"
                >
                  <option value="name-asc">Name A→Z</option>
                  <option value="name-desc">Name Z→A</option>
                </select>
                <span className="text-gray-600 hidden sm:inline">Page</span>
                <select
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 shadow-sm"
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    )
                  )}
                </select>
                <span className="text-gray-600 hidden sm:inline">
                  of {totalPages}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {pageItems.map((meal) => (
                <RecipeCard
                  key={meal.idMeal}
                  meal={meal}
                  onOpen={openDetails}
                  fav={isFav(meal.idMeal)}
                  onToggleFav={toggleFav}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        )}

        {/* Empty after search → show trending as helpful fallback */}
        {!loading &&
          !error &&
          results.length === 0 &&
          hasSearchedRef.current && (
            <>
              <div className="mt-10 text-center text-gray-600">
                No results. Try different ingredients or clear filters.
              </div>
              <section className="mt-8">
                <h3 className="mb-4 text-lg font-semibold">🔥 Trending now</h3>
                {trendingLoading ? (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                    {trending.map((m) => (
                      <RecipeCard
                        key={m.idMeal}
                        meal={m}
                        onOpen={openDetails}
                        fav={isFav(m.idMeal)}
                        onToggleFav={toggleFav}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

        {/* Landing state → show trending prominently */}
        {!loading && !error && !hasSearchedRef.current && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">🔥 Trending now</h2>
              <button
                onClick={async () => {
                  setTrendingLoading(true);
                  try {
                    const calls = Array.from({ length: 6 }, () =>
                      fetchJSON(API.random)
                    );
                    const packs = await Promise.all(calls);
                    const merged = packs.flatMap((p) => p.meals || []);
                    const map = new Map();
                    merged.forEach((m) => map.set(m.idMeal, m));
                    setTrending(Array.from(map.values()));
                  } finally {
                    setTrendingLoading(false);
                  }
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
            {trendingLoading ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {trending.map((m) => (
                  <RecipeCard
                    key={m.idMeal}
                    meal={m}
                    onOpen={openDetails}
                    fav={isFav(m.idMeal)}
                    onToggleFav={toggleFav}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">❤️ Favorites</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {[...new Set([...results, ...trending])]
                .filter((m) => favorites.includes(m.idMeal))
                .map((m) => (
                  <RecipeCard
                    key={m.idMeal}
                    meal={m}
                    onOpen={openDetails}
                    fav={isFav(m.idMeal)}
                    onToggleFav={toggleFav}
                  />
                ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-gray-600">
          Built By Sopan Bharkad ❤️
        </div>
      </footer>

      {/* Details modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.strMeal || "Recipe Details"}
      >
        {detailLoading && <Spinner />}
        {!detailLoading && detail && !detail._error && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <img
                src={
                  detail.strMealThumb || PlaceholderImgSVG({ label: "Recipe" })
                }
                onError={(e) =>
                  (e.currentTarget.src = PlaceholderImgSVG({
                    label: "Image unavailable",
                  }))
                }
                alt={detail.strMeal}
                className="w-full rounded-xl"
              />
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {detail.strCategory && <Badge>{detail.strCategory}</Badge>}
                {detail.strArea && <Badge>{detail.strArea}</Badge>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="mb-1 font-semibold">Ingredients</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {detail._ingredients.map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-1 font-semibold">Instructions</h4>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">
                  {detail.strInstructions}
                </p>
              </div>
              <div className="flex gap-2">
                {detail.strSource && (
                  <a
                    href={detail.strSource}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Source ↗
                  </a>
                )}
                {detail.strYoutube && (
                  <a
                    href={detail.strYoutube}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Watch on YouTube ▶
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        {!detailLoading && detail?._error && (
          <div className="text-red-600">
            Could not load recipe details. Please try again.
          </div>
        )}
      </Modal>
    </div>
  );
}
