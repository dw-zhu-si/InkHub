import {
  LONG_WORLDBUILDING_DIRECTORY_MAX_CATEGORIES,
  LONG_WORLDBUILDING_DIRECTORY_MAX_ITEMS,
  type LongWorldbuildingCategory,
  type LongWorldbuildingDirectorySnapshot
} from "@deepwrite/contracts";

export function buildLongWorldbuildingDirectorySnapshot(
  categories: readonly LongWorldbuildingCategory[]
): LongWorldbuildingDirectorySnapshot {
  const visibleCategories = [...categories]
    .sort((left, right) => left.order - right.order)
    .slice(0, LONG_WORLDBUILDING_DIRECTORY_MAX_CATEGORIES);
  let remainingItemCapacity = LONG_WORLDBUILDING_DIRECTORY_MAX_ITEMS;
  return {
    categories: visibleCategories.map((category) => {
      if (category.format === "text") {
        return {
          categoryId: category.id,
          title: category.title,
          order: category.order,
          format: "text" as const
        };
      }
      const orderedItems = [...category.items].sort(
        (left, right) => left.order - right.order
      );
      const items = orderedItems
        .slice(0, remainingItemCapacity)
        .map((item) => ({ itemId: item.id, title: item.title, order: item.order }));
      remainingItemCapacity -= items.length;
      return {
        categoryId: category.id,
        title: category.title,
        order: category.order,
        format: "list" as const,
        itemCount: orderedItems.length,
        items,
        omittedItemCount: orderedItems.length - items.length
      };
    }),
    omittedCategoryCount: categories.length - visibleCategories.length
  };
}
