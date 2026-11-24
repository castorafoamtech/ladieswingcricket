// Demo data so the app can be tried before the real sheet is imported.
import { uid, defaultSettings } from './engine.js';

const FIRST_OLD = ['Aarav','Vihaan','Aditya','Krish','Dev','Harsh','Jay','Kunal','Manav','Nirav','Parth','Raj','Smit','Tirth','Uday','Yash','Zeel','Aanya','Bhavya','Charmi','Dhruvi','Esha','Foram','Hetvi','Isha','Jiya','Kavya','Mansi','Nidhi','Riya','Sneha','Tanvi','Urvi','Vidhi','Yesha','Ahan','Bhargav','Chirag','Darshan','Eshan'];
const FIRST = ['Aanya','Bhavya','Charmi','Dhruvi','Esha','Foram','Hetvi','Isha','Jiya','Kavya','Mansi','Nidhi','Riya','Sneha','Tanvi','Urvi','Vidhi','Yesha','Zeel','Khushi','Mitali','Palak','Rutvi','Shreya','Trisha','Vaishali','Ankita','Bansari','Divya','Hiral','Jinal','Komal','Naisha','Pooja','Rinku','Sejal','Tithi','Unnati','Vrunda','Yashvi'];
const LAST = ['Shah','Mehta','Doshi','Parekh','Vora','Gandhi','Sheth','Kothari','Jhaveri','Bhayani','Modi','Dedhia'];
const TEAMS = [
  ['Super Strikers', 'SS', '#FF4D8D'], ['Boundary Queens', 'BQ', '#E23B3B'], ['Wicket Warriors', 'WW', '#2FBF71'], ['Spin Divas', 'SD', '#9B5CF6'],
  ['Pink Panthers', 'PP', '#19A7CE'], ['Yorker Girls', 'YG', '#FF7A1A'], ['Six Hitters', 'SH', '#E84393'], ['Royal Smashers', 'RS', '#7BD34A'],
];
const LV = ['yes', 'yes', 'sometimes', 'sometimes', 'rarely', 'no'];

export function demoData(n = 48) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({
      id: uid('p'),
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      photo: '',
      level: LV[(i * 5 + 2) % LV.length],
      basePrice: null,
      extra: { Demo: 'Yes' },
      status: 'pending', teamId: null, price: null,
    });
  }
  const teams = TEAMS.map(([name, short, color], i) => ({
    id: uid('t'), name, short, color, owner: `${FIRST[(i * 3) % FIRST.length]} ${LAST[i % LAST.length]}`,
    logo: '', ownerPhoto: '', purse: null, squadSize: null,
    jersey: { primary: color, secondary: '#0F4233', pattern: ['solid', 'stripes', 'split', 'hoops'][i % 4] },
  }));
  return { players, teams };
}
export { defaultSettings };
