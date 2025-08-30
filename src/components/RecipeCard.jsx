import Badge from './Badge.jsx';

export default function RecipeCard({ meal, onOpen, isFav, onToggleFav }) {
  return (
    <div className="relative">
      <button
        onClick={() => onOpen(meal.idMeal)}
        className="group w-full overflow-hidden rounded-2xl bg-white text-left shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <div className="relative">
          <img src={meal.strMealThumb} alt={meal.strMeal} className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2">
            <Badge>Tap for details</Badge>
          </div>
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 text-base font-semibold text-gray-900">{meal.strMeal}</h3>
        </div>
      </button>
      <button
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
        onClick={onToggleFav}
        className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow hover:bg-white"
        title={isFav ? "Remove favorite" : "Add favorite"}
      >
        {isFav ? "❤️" : "🤍"}
      </button>
    </div>
  );
}
