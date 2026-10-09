export type RumorKind = 'ship' | 'sky' | 'tech' | 'power' | 'road' | 'dire' | 'tall';

export type RumorDef = { id: string; kind: RumorKind; text: string };

export const RUMORS: readonly RumorDef[] = [
  { id: 'launchPlatform', kind: 'ship', text: 'A man at the pumps swears the ship was a launch platform. He says the basin was built to catch its falling stages.' },
  { id: 'powerPlant', kind: 'ship', text: 'Some say the ship was a power plant. They say the glow in the Fallen Sun was its heart, not its engine.' },
  { id: 'colonyShip', kind: 'ship', text: 'I heard the ship came from a colony on another world. Its people came home to die.' },
  { id: 'purgatory', kind: 'ship', text: 'The preachers say this basin is purgatory, or worse. They say the ship is how the damned arrived.' },
  { id: 'dyingEarth', kind: 'ship', text: 'Old drivers tell it like this. The ship was built to carry people away from a dying Earth, and it never got out.' },

  { id: 'starReaders', kind: 'sky', text: 'The astronomers of the Alpha Tower tried to work out where the ship came from. They did it by the way the stars move.' },
  { id: 'secretFinding', kind: 'sky', text: 'The Observatory found something else coming toward the basin. They say they kept it quiet.' },
  { id: 'movedMoons', kind: 'sky', text: 'One night the moons stood over the basin in different colors. A woman at Dustwell still will not talk about it.' },
  { id: 'philosopher', kind: 'sky', text: 'A philosopher lives alone in the Alpha Tower. They say he is the smartest man in Icarus.' },

  { id: 'brokenControlRoom', kind: 'tech', text: 'They say the ship control room was wrecked in the war between Nose and Bowl.' },
  { id: 'lockedSoldiers', kind: 'tech', text: 'Nose soldiers were shut inside the control room during the war. Nobody opened it again, so they say.' },
  { id: 'memoryMachines', kind: 'tech', text: 'Before the fall, people had machines that moved memories from one head to another. That is what the old ones say.' },
  { id: 'deepWarhead', kind: 'tech', text: 'Somewhere under the Fallen Sun lies a warhead big enough to end the whole basin. I have only heard it.' },
  { id: 'armorBreaker', kind: 'tech', text: 'Nose has the secret of a weapon that goes through any armor. They guard it closely, I hear.' },
  { id: 'greenSleepers', kind: 'tech', text: 'Drivers who sleep near the green glow wake up knowing things they never learned. I would not test it.' },

  { id: 'pierceHolds', kind: 'power', text: 'Pierce Corporation holds both Nose and Bowl through what their rulers owe it. That is the talk at every counter.' },
  { id: 'pierceCasino', kind: 'power', text: 'Pierce insures salvage runs like a casino. It bets that your truck comes back.' },
  { id: 'burialBomb', kind: 'power', text: 'The Old Army wanted to bury the Fallen Sun under a great bomb. Then nobody could fight over it again.' },
  { id: 'starvedOnPurpose', kind: 'power', text: 'The Old Army did not run out of food. Somebody starved it on purpose.' },
  { id: 'soldGuns', kind: 'power', text: 'Pierce sold the Old Army guns to Scrapjaw. Then it made every driver buy a gun to be insured.' },
  { id: 'soldRoads', kind: 'power', text: 'A clerk in the Pierce office sold the roads of insured trucks to robbers. He went west and never came back.' },
  { id: 'rentedLine', kind: 'power', text: 'The Nose Committee rents its workshop line, and Pierce money pays the rent.' },
  { id: 'administratorBook', kind: 'power', text: 'The Administrator keeps a book in the crane office. They say it could bring down both towns.' },
  { id: 'senatePipe', kind: 'power', text: 'The old Senate families on the top terraces drink the tenants water through a secret pipe.' },

  { id: 'ladyOfTheRoad', kind: 'road', text: 'Keep your radio on. The Lady of the Road is a voice that warns drivers of danger ahead.' },
  { id: 'swivelPin', kind: 'road', text: 'A Nose swivel hangs on one pin. On a sharp bend it will swing the gun into your own cab.' },
  { id: 'gunlessTowns', kind: 'road', text: 'In the west there are towns whose trucks carry no guns. A guard paid by every town keeps their roads.' },
  { id: 'glassPoints', kind: 'road', text: 'The glass on the Glass Flats all points the same way, toward the Fallen Sun.' },
  { id: 'chantCount', kind: 'road', text: 'The Sunward chant a number at the rim. They say it is the year the radio count stops.' },
  { id: 'pastTheGlass', kind: 'road', text: 'Some people out past the glass live without towns and without trucks. Nobody knows how.' },

  { id: 'steelTruck', kind: 'dire', text: 'A steel truck drives the wreck fields at night. It cannot be stopped, and nobody who met it came back to say more.' },
  { id: 'dryBasin', kind: 'dire', text: 'One day the basin will dry out completely. Everyone in it will die of thirst.' },
  { id: 'kilnTest', kind: 'dire', text: 'Kiln riders let you go if you fight hard enough. If you do not, they strip you.' },
  { id: 'craterStrangers', kind: 'dire', text: 'The Sunward take strangers into the crater. The strangers do not come back.' },
  { id: 'sentryBoots', kind: 'dire', text: 'A crew once camped in the wreck, and their sentry fell asleep. In the morning the sentry was gone, and his boots were still standing by the fire.' },

  { id: 'steelTruckRace', kind: 'tall', text: 'I raced the steel truck once, all night, and lost it at dawn. It never touched me.' },
  { id: 'glassFlatsTire', kind: 'tall', text: 'I crossed the Glass Flats on a single tire. The flats had to make room for me.' },
  { id: 'raiderTrio', kind: 'tall', text: 'A whole pack of raiders jumped me at the bridge. I left them their trucks, out of pity.' },
  { id: 'dryWell', kind: 'tall', text: 'I once sold a dry well to a man in Dustwell, and he thanked me for it.' },
  { id: 'nightRun', kind: 'tall', text: 'I drove the whole night road with no lights. The road kept out of my way.' },
  { id: 'stormOut', kind: 'tall', text: 'I sat out a dust storm in the open and came out cleaner than I went in.' },
];
