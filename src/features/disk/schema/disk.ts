export interface DiskInfo {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  freePercent: number;
  totalHuman: string;
  freeHuman: string;
}

export interface DiskReport {
  disks: DiskInfo[];
  currentModelsPath: string | null;
  currentModelsPathFree: string | null;
}
