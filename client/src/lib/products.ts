import type { ProductCategory } from "../types";

export function productCategoryLabel(category: ProductCategory | string): string {
  switch (category) {
    case "bebidas":
      return "Bebidas";
    case "suplementos":
      return "Suplementos";
    default:
      return "Otros";
  }
}