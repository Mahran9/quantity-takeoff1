/** Unit mass (kg/m) of rolled and hollow sections named as they are written on drawings ("IPE600", "HEA240", "SHS120x3"). */
const IPE: Record<number, number> = { 80: 6, 100: 8.1, 120: 10.4, 140: 12.9, 160: 15.8, 180: 18.8, 200: 22.4, 220: 26.2, 240: 30.7, 270: 36.1, 300: 42.2, 330: 49.1, 360: 57.1, 400: 66.3, 450: 77.6, 500: 90.7, 550: 106, 600: 122 };
const HEA: Record<number, number> = { 100: 16.7, 120: 19.9, 140: 24.7, 160: 30.4, 180: 35.5, 200: 42.3, 220: 50.5, 240: 60.3, 260: 68.2, 280: 76.4, 300: 88.3, 320: 97.6, 340: 105, 360: 112, 400: 125, 450: 140, 500: 155, 600: 178 };
const HEB: Record<number, number> = { 100: 20.4, 120: 26.7, 140: 33.7, 160: 42.6, 180: 51.2, 200: 61.3, 220: 71.5, 240: 83.2, 260: 93, 280: 103, 300: 117, 320: 127, 340: 134, 360: 142, 400: 155, 450: 171, 500: 187, 600: 212 };
const UPN: Record<number, number> = { 80: 8.64, 100: 10.6, 120: 13.4, 140: 16, 160: 18.8, 180: 22, 200: 25.3, 220: 29.4, 240: 33.2, 260: 37.9, 280: 41.8, 300: 46.2 };

export function kgPerMetre(label: string): number | null {
  const s = label.replace(/\s+/g, "").toUpperCase();
  let m = /^(IPE|HEA|HEB|UPN)(\d{2,3})$/.exec(s);
  if (m) {
    const t = m[1] === "IPE" ? IPE : m[1] === "HEA" ? HEA : m[1] === "HEB" ? HEB : UPN;
    return t[+m[2]] ?? null;
  }
  m = /^SHS(\d{2,3})[X*](\d+(?:\.\d+)?)$/.exec(s);
  if (m) { const a = +m[1], t = +m[2]; return Math.round(0.0314 * t * (a - t) * 100) / 100; }
  return null;
}
