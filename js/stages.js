// The build story. `at` = knob position (0–1), `h` = share of the full
// 1,454 ft height standing at that moment, `d` = the date (for the counter).
// Dates: ENR archives (enr.com/articles/60722). 410 days = Mar 17, 1930
// (construction start) to May 1, 1931 (opening day).
export const STAGES = [
  { at: 0.00, h: 0.00, d: '1929-10-01', date: 'Oct 1929', title: 'Clearing the site',
    line: 'The old Waldorf-Astoria hotel is torn down to make room.' },
  { at: 0.16, h: 0.03, d: '1930-04-07', date: 'Apr 7, 1930', title: 'First steel goes up',
    line: 'Foundations race in and the first steel column is set.' },
  { at: 0.40, h: 0.45, d: '1930-07-31', date: 'Jul 1930', title: '22 floors in 22 days',
    line: 'In July alone, the steel frame climbed 22 stories in 22 working days.' },
  { at: 0.63, h: 0.722, d: '1930-09-19', date: 'Sep 19, 1930', title: 'Steel tops out',
    line: 'The frame reaches 1,048 ft, the 86th floor, just past the Chrysler Building.' },
  { at: 0.83, h: 0.86, d: '1930-11-21', date: 'Nov 21, 1930', title: 'The mast goes on',
    line: 'The art deco mooring mast makes it the tallest building on earth.' },
  { at: 1.00, h: 1.00, d: '1931-05-01', date: 'May 1, 1931', title: 'Opening day',
    line: 'In Washington, President Hoover pressed a button to switch on the lights. Your turn.' },
];

const T = s => Date.parse(s + 'T12:00:00Z');
const START = T('1930-03-17');

export function heightAt(s) {
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1], b = STAGES[i];
    if (s <= b.at) return a.h + ((s - a.at) / (b.at - a.at)) * (b.h - a.h);
  }
  return 1;
}
export function dateAt(s) {
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1], b = STAGES[i];
    if (s <= b.at) return new Date(T(a.d) + ((s - a.at) / (b.at - a.at)) * (T(b.d) - T(a.d)));
  }
  return new Date(T(STAGES.at(-1).d));
}
export function dayAt(s) { return Math.max(0, Math.round((dateAt(s) - START) / 864e5)); }
export function floorAt(h) {
  if (h <= 0.722) return Math.round((h / 0.722) * 86);
  if (h <= 0.86) return Math.round(86 + ((h - 0.722) / (0.86 - 0.722)) * 16);
  return 102;
}
export function stageAt(s) {
  let idx = 0;
  STAGES.forEach((st, i) => { if (s + 0.012 >= st.at) idx = i; });
  return idx;
}
