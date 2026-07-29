type Entry = { count: number; windowStartMs: number };

const memoryStore = new Map<string, Entry>();

export function consumeRateLimit(input: {
  key: string;
  windowSeconds: number;
  maxRequests: number;
}) {
  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;
  const current = memoryStore.get(input.key);
  if (!current || now - current.windowStartMs >= windowMs) {
    memoryStore.set(input.key, { count: 1, windowStartMs: now });
    return { allowed: true, remaining: input.maxRequests - 1 };
  }
  const nextCount = current.count + 1;
  current.count = nextCount;
  memoryStore.set(input.key, current);
  return {
    allowed: nextCount <= input.maxRequests,
    remaining: Math.max(0, input.maxRequests - nextCount),
  };
}

export function clearRateLimitForTests() {
  memoryStore.clear();
}

