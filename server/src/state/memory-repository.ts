export type MemoryEntry = {
  id: string;
  content: string;
  createdAt: string;
};

export type MemoryRepository = {
  recent(limit: number): Promise<MemoryEntry[]>;
  append(content: string): Promise<MemoryEntry>;
};

export function createInMemoryMemoryRepository(seed: string[] = [], maxEntries = 100): MemoryRepository {
  const entries: MemoryEntry[] = seed.map((content, index) => ({
    id: `seed-${index + 1}`,
    content,
    createdAt: new Date(0).toISOString()
  }));

  return {
    async recent(limit) {
      return entries.slice(-limit);
    },
    async append(content) {
      const entry = {
        id: `memory-${entries.length + 1}`,
        content,
        createdAt: new Date().toISOString()
      };
      entries.push(entry);
      while (entries.length > maxEntries) {
        entries.shift();
      }
      return entry;
    }
  };
}
