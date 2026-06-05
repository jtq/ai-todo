const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function encodeBase62(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Base62 IDs require a positive integer");
  }
  let current = value;
  let output = "";
  while (current > 0) {
    output = alphabet[current % 62] + output;
    current = Math.floor(current / 62);
  }
  return output;
}
