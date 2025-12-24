export type Interval = {
  start: Date;
  end: Date;
};

function isValidInterval(interval: Interval): boolean {
  return interval.end.getTime() > interval.start.getTime();
}

export function subtractIntervals(base: Interval[], blocks: Interval[]): Interval[] {
  const sortedBase = [...base]
    .filter(isValidInterval)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const sortedBlocks = [...blocks]
    .filter(isValidInterval)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let result = sortedBase;

  for (const block of sortedBlocks) {
    const next: Interval[] = [];

    for (const interval of result) {
      if (block.end <= interval.start || block.start >= interval.end) {
        next.push(interval);
        continue;
      }

      if (block.start > interval.start) {
        next.push({ start: interval.start, end: block.start });
      }

      if (block.end < interval.end) {
        next.push({ start: block.end, end: interval.end });
      }
    }

    result = next;
  }

  return result;
}
