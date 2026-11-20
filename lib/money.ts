// Integer allocation avoids floating-point drift when large invoice values are split.
export const allocateFloor = (total: number, part: number, whole: number) => Number(BigInt(total) * BigInt(part) / BigInt(whole));
export const allocateRound = (total: number, part: number, whole: number) => Number((2n * BigInt(total) * BigInt(part) + BigInt(whole)) / (2n * BigInt(whole)));
