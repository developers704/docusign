/** Shared agreement categories (DocuSign-style) with user-addable custom labels. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CATEGORIES } from "./categoryConstants";

export type CategoriesFile = {
  items: string[];
  updatedAt: string;
};

export { DEFAULT_CATEGORIES, REMINDER_FREQUENCY_OPTIONS } from "./categoryConstants";
export type { ReminderFrequency } from "./categoryConstants";

function categoriesPath() {
  return path.join(process.cwd(), "data", "categories.json");
}

export async function readCategories(): Promise<string[]> {
  try {
    const raw = await readFile(categoriesPath(), "utf8");
    const parsed = JSON.parse(raw) as CategoriesFile;
    const customs = Array.isArray(parsed.items) ? parsed.items.map((item) => String(item).trim()).filter(Boolean) : [];
    return [...new Set([...DEFAULT_CATEGORIES, ...customs])];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

export async function addCategory(label: string): Promise<string[]> {
  const name = label.trim();
  if (!name) throw new Error("Category name is required.");
  if (name.length > 60) throw new Error("Category name is too long.");
  const all = await readCategories();
  if (all.some((item) => item.toLowerCase() === name.toLowerCase())) return all;

  let customs: string[] = [];
  try {
    const raw = await readFile(categoriesPath(), "utf8");
    const parsed = JSON.parse(raw) as CategoriesFile;
    customs = Array.isArray(parsed.items) ? parsed.items.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    customs = [];
  }
  if (!customs.some((item) => item.toLowerCase() === name.toLowerCase()) && !DEFAULT_CATEGORIES.includes(name)) {
    customs.push(name);
  }
  await mkdir(path.dirname(categoriesPath()), { recursive: true });
  await writeFile(
    categoriesPath(),
    JSON.stringify({ items: customs, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return readCategories();
}
