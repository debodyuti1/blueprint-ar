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

export const FINALE = {
  date: 'May 1, 1931', title: 'Lights on', big: '410 days',
  line: '102 floors, from first shovel to opening day.',
  note: 'The broadcast antenna on top was added in 1950.',
};

// tap-to-read stories pinned to the building (y = height on the building)
export const STORIES = [
  { id: 'rivets', y: 0.3, label: 'Rivet gangs', kicker: 'Floor 36',
    title: 'Red-hot rivets, tossed through the air',
    text: 'Rivets were heated in a forge, tossed to a catcher with a bucket, then hammered in by the rest of the gang. Around 3,000 workers raised the building.',
    src: 'https://www.inkl.com/news/it-would-take-11-seconds-to-hit-the-ground-the-roughneck-daredevils-who-built-the-empire-state-building' },
  { id: 'hine', y: 0.62, label: 'Sky Boy', kicker: 'Floor 74',
    title: 'Photographed a quarter mile up',
    text: 'Lewis Hine photographed the ironworkers at work. His “Sky Boy” shows Neil Doherty on a steel cable so high that a fall would take about 11 seconds.',
    src: 'https://www.inkl.com/news/it-would-take-11-seconds-to-hit-the-ground-the-roughneck-daredevils-who-built-the-empire-state-building' },
  { id: 'mast', y: 0.82, label: 'Airship dock', kicker: 'The mast',
    title: 'A parking spot for airships',
    text: 'The crown was designed as a mooring mast for dirigibles. Steel for it topped out on Nov 21, 1930, but high winds made docking impractical, and it became an observatory instead.',
    src: 'https://www.enr.com/articles/60722-the-race-into-the-sky-that-built-the-empire-state-building' },
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
