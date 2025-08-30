export const API = {
  filterByIngredient: (i) => `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(i)}`,
  filterByCategory: (c) => `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(c)}`,
  filterByArea: (a) => `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(a)}`,
  listCategories: 'https://www.themealdb.com/api/json/v1/1/list.php?c=list',
  listAreas: 'https://www.themealdb.com/api/json/v1/1/list.php?a=list',
  lookup: (id) => `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`,
  random: 'https://www.themealdb.com/api/json/v1/1/random.php',
};

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

export function intersectById(arrays) {
  if (!arrays.length) return [];
  return arrays.reduce((acc, curr) => {
    const set = new Set(curr.map((m) => m.idMeal));
    return acc.filter((m) => set.has(m.idMeal));
  });
}
