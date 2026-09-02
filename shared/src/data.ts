// Business India — finalized game data (from the approved design mockups).
// All money values are in rupees and must match the approved 26 tickets exactly.

export type GroupKey = 'lb' | 'mg' | 'yl' | 'gr';

export interface GroupStyle {
  key: GroupKey;
  label: string;
  strong: string; // saturated color (borders, card headers)
  headerText: string;
  fill: string; // light one-shade tile fill
  dark: string; // readable text on the light fill
}

export const GROUPS: Record<GroupKey, GroupStyle> = {
  lb: { key: 'lb', label: 'Light blue', strong: '#3B9CD9', headerText: '#ffffff', fill: '#DDEEF9', dark: '#14486B' },
  mg: { key: 'mg', label: 'Magenta', strong: '#D6338F', headerText: '#ffffff', fill: '#FADFEE', dark: '#7A1450' },
  yl: { key: 'yl', label: 'Yellow', strong: '#E0B400', headerText: '#513C00', fill: '#FBF0C8', dark: '#513C00' },
  gr: { key: 'gr', label: 'Green', strong: '#2C8C4B', headerText: '#ffffff', fill: '#DFF1E5', dark: '#14502A' },
};

export const BANK_STYLE = { strong: '#7A8288', fill: '#ECEEF0', dark: '#3E464C' };

export interface StateDef {
  name: string;
  group: GroupKey;
  price: number;
  no: number; // ticket number
  /** [site only, 1 house, 2 houses, 3 houses, hotel] */
  rents: [number, number, number, number, number];
  houseCost: number; // cost of house == cost of hotel
  landmark: string;
  city: string;
  icon: string;
}

export const STATES: Record<string, StateDef> = {
  'Madhya Pradesh': { name: 'Madhya Pradesh', group: 'lb', price: 1500, no: 6, rents: [200, 600, 1500, 2500, 3600], houseCost: 2000, landmark: 'Sanchi Stupa', city: 'Sanchi', icon: 'ti-building-monument' },
  'Bihar': { name: 'Bihar', group: 'lb', price: 2000, no: 10, rents: [150, 800, 2000, 3000, 4500], houseCost: 2500, landmark: 'Mahabodhi Temple', city: 'Bodh Gaya', icon: 'ti-building-monument' },
  'Uttar Pradesh': { name: 'Uttar Pradesh', group: 'lb', price: 2500, no: 8, rents: [200, 900, 1600, 2500, 3500], houseCost: 3000, landmark: 'Taj Mahal', city: 'Agra', icon: 'ti-building-monument' },
  'Rajasthan': { name: 'Rajasthan', group: 'lb', price: 3000, no: 7, rents: [250, 1500, 2750, 4000, 5500], houseCost: 4000, landmark: 'Hawa Mahal', city: 'Jaipur', icon: 'ti-building-castle' },
  'Haryana': { name: 'Haryana', group: 'lb', price: 4000, no: 9, rents: [400, 1500, 3000, 4500, 5500], houseCost: 4500, landmark: 'Brahma Sarovar', city: 'Kurukshetra', icon: 'ti-fountain' },
  'Assam': { name: 'Assam', group: 'mg', price: 2500, no: 3, rents: [200, 1200, 2600, 3500, 5000], houseCost: 3000, landmark: 'Kamakhya Temple', city: 'Guwahati', icon: 'ti-building-castle' },
  'Telangana': { name: 'Telangana', group: 'mg', price: 3500, no: 5, rents: [300, 1200, 3000, 4500, 6000], houseCost: 5000, landmark: 'Charminar', city: 'Hyderabad', icon: 'ti-building-arch' },
  'Gujarat': { name: 'Gujarat', group: 'mg', price: 4000, no: 2, rents: [400, 1500, 3000, 4200, 5000], houseCost: 4500, landmark: 'Statue of Unity', city: 'Kevadia', icon: 'ti-building-monument' },
  'West Bengal': { name: 'West Bengal', group: 'mg', price: 6500, no: 4, rents: [800, 3200, 4500, 6500, 8000], houseCost: 6000, landmark: 'Victoria Memorial', city: 'Kolkata', icon: 'ti-building-monument' },
  'Maharashtra': { name: 'Maharashtra', group: 'mg', price: 8500, no: 1, rents: [1200, 4000, 5500, 7500, 9000], houseCost: 7500, landmark: 'Gateway of India', city: 'Mumbai', icon: 'ti-building-arch' },
  'Himachal Pradesh': { name: 'Himachal Pradesh', group: 'yl', price: 2200, no: 16, rents: [200, 1000, 2750, 4500, 6000], houseCost: 3500, landmark: 'Christ Church', city: 'Shimla', icon: 'ti-building-church' },
  'Punjab': { name: 'Punjab', group: 'yl', price: 3300, no: 17, rents: [300, 1400, 2800, 4000, 5000], houseCost: 4500, landmark: 'Golden Temple', city: 'Amritsar', icon: 'ti-building-mosque' },
  'Karnataka': { name: 'Karnataka', group: 'yl', price: 4000, no: 20, rents: [400, 1500, 3000, 4500, 5500], houseCost: 4500, landmark: 'Vidhana Soudha', city: 'Bengaluru', icon: 'ti-building-bank' },
  'Jammu & Kashmir': { name: 'Jammu & Kashmir', group: 'yl', price: 5000, no: 18, rents: [550, 3000, 5000, 7000, 8000], houseCost: 6000, landmark: 'Dal Lake', city: 'Srinagar', icon: 'ti-ripple' },
  'Tamil Nadu': { name: 'Tamil Nadu', group: 'yl', price: 7000, no: 19, rents: [900, 3500, 5000, 7000, 8500], houseCost: 6500, landmark: 'Meenakshi Temple', city: 'Madurai', icon: 'ti-building-castle' },
  'Chhattisgarh': { name: 'Chhattisgarh', group: 'gr', price: 2500, no: 12, rents: [200, 900, 1600, 2500, 3500], houseCost: 3000, landmark: 'Chitrakote Falls', city: 'Bastar', icon: 'ti-ripple' },
  'Odisha': { name: 'Odisha', group: 'gr', price: 2500, no: 13, rents: [200, 1000, 2250, 3500, 4500], houseCost: 3000, landmark: 'Konark Sun Temple', city: 'Konark', icon: 'ti-building-monument' },
  'Kerala': { name: 'Kerala', group: 'gr', price: 3000, no: 14, rents: [300, 1200, 2000, 4250, 4500], houseCost: 4000, landmark: 'Padmanabhaswamy Temple', city: 'Thiruvananthapuram', icon: 'ti-building-castle' },
  'Goa': { name: 'Goa', group: 'gr', price: 4000, no: 15, rents: [400, 2200, 3500, 5000, 6500], houseCost: 4500, landmark: 'Basilica of Bom Jesus', city: 'Old Goa', icon: 'ti-building-church' },
  'Andhra Pradesh': { name: 'Andhra Pradesh', group: 'gr', price: 6000, no: 11, rents: [750, 3000, 4300, 5500, 7500], houseCost: 5000, landmark: 'Tirumala Temple', city: 'Tirupati', icon: 'ti-building-castle' },
};

export interface BankDef {
  name: string;
  price: number;
  no: number;
  icon: string;
  pair: string; // owning the pair doubles the rent
  rent: { kind: 'fixed'; base: number } | { kind: 'dice'; mult: number };
}

export const BANKS: Record<string, BankDef> = {
  'RBL Bank': { name: 'RBL Bank', price: 3200, no: 21, icon: 'ti-building-bank', pair: 'SBI Bank', rent: { kind: 'fixed', base: 1000 } },
  'Adani Ports': { name: 'Adani Ports', price: 9500, no: 22, icon: 'ti-ship', pair: 'IndiGo Airlines', rent: { kind: 'fixed', base: 2000 } },
  'IPL Team (RCB)': { name: 'IPL Team (RCB)', price: 2500, no: 23, icon: 'ti-trophy', pair: 'Narendra Modi Stadium', rent: { kind: 'dice', mult: 100 } },
  'SBI Bank': { name: 'SBI Bank', price: 3500, no: 24, icon: 'ti-building-bank', pair: 'RBL Bank', rent: { kind: 'fixed', base: 1200 } },
  'IndiGo Airlines': { name: 'IndiGo Airlines', price: 10500, no: 25, icon: 'ti-plane', pair: 'Adani Ports', rent: { kind: 'fixed', base: 2400 } },
  'Narendra Modi Stadium': { name: 'Narendra Modi Stadium', price: 5500, no: 26, icon: 'ti-building-stadium', pair: 'IPL Team (RCB)', rent: { kind: 'dice', mult: 200 } },
};

export type Tile =
  | { t: 'start'; label: string; icon: string }
  | { t: 'jail'; label: string; icon: string }
  | { t: 'rest'; label: string; icon: string }
  | { t: 'resort'; label: string; icon: string }
  | { t: 'chance'; label: string; icon: string }
  | { t: 'chest'; label: string; icon: string }
  | { t: 'incomeTax'; label: string; icon: string }
  | { t: 'wealthTax'; label: string; icon: string }
  | { t: 'state'; name: string }
  | { t: 'bank'; name: string };

/** The 36-tile track, index 0 = START (bottom-left). Movement follows the START
 *  arrow: up the left column, so a 4 from START lands on Gujarat — like the real board. */
export const SEQ: Tile[] = [
  { t: 'start', label: 'START', icon: 'ti-arrow-big-up' },
  { t: 'state', name: 'Maharashtra' },
  { t: 'bank', name: 'RBL Bank' },
  { t: 'bank', name: 'Adani Ports' },
  { t: 'state', name: 'Gujarat' },
  { t: 'incomeTax', label: 'Income tax', icon: 'ti-receipt-tax' },
  { t: 'state', name: 'Madhya Pradesh' },
  { t: 'chance', label: 'Chance · Play try', icon: 'ti-dice' },
  { t: 'state', name: 'Rajasthan' },
  { t: 'jail', label: 'JAIL PUNISHMENT', icon: 'ti-lock' },
  { t: 'state', name: 'Andhra Pradesh' },
  { t: 'state', name: 'Chhattisgarh' },
  { t: 'bank', name: 'IPL Team (RCB)' },
  { t: 'bank', name: 'SBI Bank' },
  { t: 'state', name: 'Himachal Pradesh' },
  { t: 'state', name: 'Punjab' },
  { t: 'chest', label: 'Community chest', icon: 'ti-box' },
  { t: 'state', name: 'Jammu & Kashmir' },
  { t: 'resort', label: 'RESORT PICNIC ENJOYMENT', icon: 'ti-beach' },
  { t: 'state', name: 'Uttar Pradesh' },
  { t: 'chance', label: 'Chance · Play try', icon: 'ti-dice' },
  { t: 'state', name: 'Haryana' },
  { t: 'state', name: 'Bihar' },
  { t: 'state', name: 'Assam' },
  { t: 'bank', name: 'IndiGo Airlines' },
  { t: 'state', name: 'West Bengal' },
  { t: 'state', name: 'Telangana' },
  { t: 'rest', label: 'REST HOUSE', icon: 'ti-home' },
  { t: 'state', name: 'Tamil Nadu' },
  { t: 'chest', label: 'Community chest', icon: 'ti-box' },
  { t: 'state', name: 'Karnataka' },
  { t: 'wealthTax', label: 'Wealth tax', icon: 'ti-receipt-tax' },
  { t: 'state', name: 'Odisha' },
  { t: 'state', name: 'Kerala' },
  { t: 'bank', name: 'Narendra Modi Stadium' },
  { t: 'state', name: 'Goa' },
];

export const N_TILES = SEQ.length; // 36
export const JAIL_TILE = 9;
export const REST_TILE = 27;
export const START_BONUS = 3000;
export const JAIL_FINE = 1000;
export const JAIL_MAX_TURNS = 5;
export const TOTAL_POOL = 199800;

export type CardEffect =
  | { kind: 'receive'; amount: number }
  | { kind: 'pay'; amount: number }
  | { kind: 'collectFromEach'; amount: number }
  | { kind: 'goToJail' }
  | { kind: 'restHouse' } // move to rest house + skip next turn
  | { kind: 'repairs'; perHouse: number; perHotel: number };

export interface CardRule { n: number; text: string; effect: CardEffect }

// Chance — odd dice total: receive from the bank.
export const CHANCE_ODD: CardRule[] = [
  { n: 3, text: 'Lottery prize ₹2500', effect: { kind: 'receive', amount: 2500 } },
  { n: 5, text: 'You have won the crossword competition prize of ₹1000', effect: { kind: 'receive', amount: 1000 } },
  { n: 7, text: 'You have won a jackpot of ₹2000', effect: { kind: 'receive', amount: 2000 } },
  { n: 9, text: 'You have won ₹5000', effect: { kind: 'receive', amount: 5000 } },
  { n: 11, text: 'Prize for best performance in export ₹3000', effect: { kind: 'receive', amount: 3000 } },
];

// Chance — even dice total: pay to the bank.
export const CHANCE_EVEN: CardRule[] = [
  { n: 2, text: 'Loss in share market ₹2000', effect: { kind: 'pay', amount: 2000 } },
  { n: 4, text: 'Fine for accident due to driving under liquor influence ₹1000', effect: { kind: 'pay', amount: 1000 } },
  { n: 6, text: 'House repairs ₹1500', effect: { kind: 'pay', amount: 1500 } },
  { n: 8, text: 'Loss due to fire in godown ₹3000', effect: { kind: 'pay', amount: 3000 } },
  { n: 10, text: 'Go to jail', effect: { kind: 'goToJail' } },
  { n: 12, text: 'Go to rest house — you cannot play your next turn', effect: { kind: 'restHouse' } },
];

// Community chest — even dice total: receive from the bank.
export const CHEST_EVEN: CardRule[] = [
  { n: 2, text: 'It is your birthday — collect ₹500 from each player', effect: { kind: 'collectFromEach', amount: 500 } },
  { n: 4, text: '1st prize in reality TV show ₹2500', effect: { kind: 'receive', amount: 2500 } },
  { n: 6, text: 'Income tax refund ₹2000', effect: { kind: 'receive', amount: 2000 } },
  { n: 8, text: 'Go to rest house — you cannot play your next turn', effect: { kind: 'restHouse' } },
  { n: 10, text: 'Receive interest on shares ₹1500', effect: { kind: 'receive', amount: 1500 } },
  { n: 12, text: 'Sale of stocks — collect ₹3000', effect: { kind: 'receive', amount: 3000 } },
];

// Community chest — odd dice total: pay to the bank.
export const CHEST_ODD: CardRule[] = [
  { n: 3, text: 'Go to jail', effect: { kind: 'goToJail' } },
  { n: 5, text: 'School and medical fees ₹1000', effect: { kind: 'pay', amount: 1000 } },
  { n: 7, text: 'Marriage celebration ₹2000', effect: { kind: 'pay', amount: 2000 } },
  { n: 9, text: 'General repair on all your properties — each house ₹50, each hotel ₹100', effect: { kind: 'repairs', perHouse: 50, perHotel: 100 } },
  { n: 11, text: 'Pay insurance premium ₹1500', effect: { kind: 'pay', amount: 1500 } },
];

export function cardForRoll(tile: 'chance' | 'chest', total: number): CardRule {
  const odd = total % 2 === 1;
  const list = tile === 'chance' ? (odd ? CHANCE_ODD : CHANCE_EVEN) : odd ? CHEST_ODD : CHEST_EVEN;
  const rule = list.find((r) => r.n === total);
  if (!rule) throw new Error(`no card rule for ${tile} total ${total}`);
  return rule;
}

export const PLAYER_COLORS = ['#E24B4A', '#2E86D8', '#2C8C4B', '#BA7517'];
