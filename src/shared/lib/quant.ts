export const QUANT_ORDER: Record<string, number> = {
  Q2_K: 1, Q2_K_S: 1,
  IQ3_XXS: 2, IQ3_XS: 2, IQ3_S: 2, IQ3_M: 2,
  Q3_K_S: 2, Q3_K_M: 2, Q3_K_L: 2,
  IQ4_XS: 3, IQ4_NL: 3,
  Q4_0: 3, Q4_1: 3, Q4_K_S: 3, Q4_K_M: 3,
  Q5_0: 4, Q5_1: 4, Q5_K_S: 4, Q5_K_M: 4,
  Q6_K: 5,
  Q8_0: 6,
  BF16: 7, F16: 7, FP16: 7,
  F32: 8, FP32: 8,
};

export const getQuantLevel = (label: string): number => {
  return QUANT_ORDER[label] ?? 0;
};
