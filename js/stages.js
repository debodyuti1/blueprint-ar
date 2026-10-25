// The build story. `at` = slider position (0–1), `h` = share of the full
// 1,454 ft height standing at that moment. Sources: ENR archives
// (enr.com/articles/60722) for dates; 410 days is the commonly cited figure.
export const STAGES = [
  { at: 0.00, h: 0.00, date: 'Oct 1929', title: 'Clearing the site',
    line: 'The old Waldorf-Astoria hotel is torn down to make room.' },
  { at: 0.16, h: 0.03, date: 'Apr 7, 1930', title: 'First steel goes up',
    line: 'Foundations race in and the first steel column is set.' },
  { at: 0.40, h: 0.45, date: 'Jul 1930', title: '22 floors in 22 days',
    line: 'In July alone, the steel frame climbed 22 stories in 22 working days.' },
  { at: 0.63, h: 0.722, date: 'Sep 19, 1930', title: 'Steel tops out',
    line: 'The frame reaches 1,048 ft, the 86th floor. Still not done.' },
  { at: 0.83, h: 0.86, date: 'Nov 21, 1930', title: 'The mast goes on',
    line: 'The art deco mooring mast makes it the tallest building on earth.' },
  { at: 1.00, h: 1.00, date: 'May 1, 1931', title: 'Open for business',
    line: '102 floors, built in about 410 days.', big: '410 days',
    note: 'The broadcast antenna on top was added in 1950.' },
];

// slider position -> building height (0–1), piecewise linear between stages
export function heightAt(s) {
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1], b = STAGES[i];
    if (s <= b.at) return a.h + ((s - a.at) / (b.at - a.at)) * (b.h - a.h);
  }
  return 1;
}

// the stage whose caption should show for a slider position
export function stageAt(s) {
  let idx = 0;
  STAGES.forEach((st, i) => { if (s + 0.02 >= st.at) idx = i; });
  return idx;
}
