export interface LocalModel {
  name: string;
  id: string;
  size: number;
  sizeHuman: string;
  modifiedAt: string;
  family: string;
  parameterSize: string;
  quantizationLevel: string;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
}
