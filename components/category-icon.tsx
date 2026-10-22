import { BookOpen, BookText, LibraryBig, Landmark, Leaf, HeartHandshake, Sun, Moon } from "lucide-react";
export function CategoryIcon({ name }: { name: string }) {
  const Icon = ({ book: BookOpen, open: BookText, library: LibraryBig, mosque: Landmark, leaf: Leaf, heart: HeartHandshake, sun: Sun, moon: Moon } as const)[name as "book"] || BookOpen;
  return <Icon size={22} strokeWidth={1.5} />;
}
