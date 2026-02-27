const BYTES_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const BYTES_PER_UNIT = 1024;

export const formatBytes = (bytes: number): string => {
  let val = bytes;
  let idx = 0;
  while (val >= BYTES_PER_UNIT && idx < BYTES_UNITS.length - 1) {
    val /= BYTES_PER_UNIT;
    idx++;
  }
  return `${val.toFixed(1)} ${BYTES_UNITS[idx]}`;
};
