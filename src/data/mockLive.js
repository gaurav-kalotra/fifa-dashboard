// Demo data for ?demo=1 mode — BRA vs HAI and TUR vs PAR (Matchday 9)
const ss = id => `https://api.sofascore.com/api/v1/player/${id}/image`

const BRA_HAI = 'demo/1'
const TUR_PAR = 'demo/2'

export const MOCK_LIVE_MATCHES = [
  { mk: BRA_HAI, homeAbbr: 'BRA', awayAbbr: 'HAI', homeScore: 3, awayScore: 0, clock: '73', isHT: false },
  { mk: TUR_PAR, homeAbbr: 'TUR', awayAbbr: 'PAR', homeScore: 1, awayScore: 1, clock: '68', isHT: false },
]

export const MOCK_TIMELINES = {
  [BRA_HAI]: [
    { min: '22', type: 'goal',   player: 'Vinícius Jr.', side: 'home' },
    { min: '38', type: 'yellow', player: 'Joseph',        side: 'away' },
    { min: '45', type: 'goal',   player: 'Rodrygo',       side: 'home' },
    { min: '61', type: 'goal',   player: 'Endrick',       side: 'home' },
    { min: '63', type: 'sub',    player: 'Vinícius Jr.', playerOn: 'Savinho', side: 'home' },
  ],
  [TUR_PAR]: [
    { min: '31', type: 'goal',   player: 'Calhanoglu',  side: 'home' },
    { min: '48', type: 'yellow', player: 'Alderete',     side: 'away' },
    { min: '56', type: 'goal',   player: 'Sanabria',     side: 'away' },
    { min: '60', type: 'yellow', player: 'Özcan',        side: 'home' },
  ],
}

export const MOCK_LINEUPS = {
  [BRA_HAI]: {
    homeFormation: '4-3-3', awayFormation: '4-3-3',
    homeCoach: 'Dorival Júnior', awayCoach: 'Marc Collat',
    home: [
      { id:'b1',  name:'Alisson',         jersey:'1',  pos:'GK', photo: ss(159073),  jerseyImg:null, formationPlace:1,  rating:null },
      { id:'b2',  name:'Danilo',           jersey:'2',  pos:'D',  photo: ss(138671),  jerseyImg:null, formationPlace:2,  rating:null },
      { id:'b3',  name:'Militão',          jersey:'3',  pos:'D',  photo: ss(825516),  jerseyImg:null, formationPlace:3,  rating:null },
      { id:'b4',  name:'Marquinhos',       jersey:'4',  pos:'D',  photo: ss(101964),  jerseyImg:null, formationPlace:4,  rating:null },
      { id:'b5',  name:'Wendell',          jersey:'6',  pos:'D',  photo: null,         jerseyImg:null, formationPlace:5,  rating:null },
      { id:'b6',  name:'Casemiro',         jersey:'5',  pos:'M',  photo: ss(168658),  jerseyImg:null, formationPlace:6,  rating:null },
      { id:'b7',  name:'Bruno Guimarães', jersey:'8',  pos:'M',  photo: ss(821514),  jerseyImg:null, formationPlace:7,  rating:null },
      { id:'b8',  name:'Paquetá',          jersey:'10', pos:'M',  photo: ss(421459),  jerseyImg:null, formationPlace:8,  rating:null },
      { id:'b9',  name:'Rodrygo',          jersey:'11', pos:'F',  photo: ss(876144),  jerseyImg:null, formationPlace:9,  rating:null },
      { id:'b10', name:'Vinícius Jr.',    jersey:'7',  pos:'F',  photo: ss(750710),  jerseyImg:null, formationPlace:10, rating:null },
      { id:'b11', name:'Endrick',          jersey:'9',  pos:'F',  photo: ss(1129718), jerseyImg:null, formationPlace:11, rating:null },
    ],
    away: [
      { id:'h1',  name:'Voltaire',  jersey:'1',  pos:'GK', photo:null, jerseyImg:null, formationPlace:1,  rating:null },
      { id:'h2',  name:'Salomon',   jersey:'2',  pos:'D',  photo:null, jerseyImg:null, formationPlace:2,  rating:null },
      { id:'h3',  name:'Geffrard',  jersey:'5',  pos:'D',  photo:null, jerseyImg:null, formationPlace:3,  rating:null },
      { id:'h4',  name:'Joseph',    jersey:'4',  pos:'D',  photo:null, jerseyImg:null, formationPlace:4,  rating:null },
      { id:'h5',  name:'Bazile',    jersey:'3',  pos:'D',  photo:null, jerseyImg:null, formationPlace:5,  rating:null },
      { id:'h6',  name:'Guerrier',  jersey:'6',  pos:'M',  photo:null, jerseyImg:null, formationPlace:6,  rating:null },
      { id:'h7',  name:'Delgado',   jersey:'8',  pos:'M',  photo:null, jerseyImg:null, formationPlace:7,  rating:null },
      { id:'h8',  name:'David',     jersey:'7',  pos:'M',  photo:null, jerseyImg:null, formationPlace:8,  rating:null },
      { id:'h9',  name:'Léandre',   jersey:'9',  pos:'F',  photo:null, jerseyImg:null, formationPlace:9,  rating:null },
      { id:'h10', name:'Lala',      jersey:'11', pos:'F',  photo:null, jerseyImg:null, formationPlace:10, rating:null },
      { id:'h11', name:'Casseus',   jersey:'10', pos:'F',  photo:null, jerseyImg:null, formationPlace:11, rating:null },
    ],
    homeBench: [
      { id:'bb1', name:'Savinho',      jersey:'20', pos:'F', photo:null, jerseyImg:null, formationPlace:99, rating:null },
      { id:'bb2', name:'Gabriel Silva',jersey:'17', pos:'F', photo:null, jerseyImg:null, formationPlace:99, rating:null },
      { id:'bb3', name:'André',        jersey:'6',  pos:'M', photo:null, jerseyImg:null, formationPlace:99, rating:null },
      { id:'bb4', name:'Gerson',       jersey:'8',  pos:'M', photo:null, jerseyImg:null, formationPlace:99, rating:null },
      { id:'bb5', name:'Bento',        jersey:'25', pos:'GK',photo:null, jerseyImg:null, formationPlace:99, rating:null },
    ],
    awayBench: [],
  },
  [TUR_PAR]: {
    homeFormation: '4-2-3-1', awayFormation: '4-4-2',
    homeCoach: 'Vincenzo Montella', awayCoach: 'Gustavo Alfaro',
    home: [
      { id:'t1',  name:'Günok',        jersey:'1',  pos:'GK', photo: ss(150040), jerseyImg:null, formationPlace:1,  rating:null },
      { id:'t2',  name:'Çelik',        jersey:'2',  pos:'D',  photo: ss(753024), jerseyImg:null, formationPlace:2,  rating:null },
      { id:'t3',  name:'Demiral',      jersey:'4',  pos:'D',  photo: ss(798439), jerseyImg:null, formationPlace:3,  rating:null },
      { id:'t4',  name:'Akaydin',      jersey:'5',  pos:'D',  photo: null,        jerseyImg:null, formationPlace:4,  rating:null },
      { id:'t5',  name:'Kadıoğlu',    jersey:'3',  pos:'D',  photo: ss(875684), jerseyImg:null, formationPlace:5,  rating:null },
      { id:'t6',  name:'Calhanoglu',   jersey:'10', pos:'M',  photo: ss(168719), jerseyImg:null, formationPlace:6,  rating:null },
      { id:'t7',  name:'Özcan',        jersey:'8',  pos:'M',  photo: ss(869354), jerseyImg:null, formationPlace:7,  rating:null },
      { id:'t8',  name:'Aktürkoğlu', jersey:'11', pos:'F',  photo: ss(878406), jerseyImg:null, formationPlace:8,  rating:null },
      { id:'t9',  name:'Güler',        jersey:'9',  pos:'F',  photo: ss(1039024),jerseyImg:null, formationPlace:9,  rating:null },
      { id:'t10', name:'Kahveci',      jersey:'7',  pos:'F',  photo: null,        jerseyImg:null, formationPlace:10, rating:null },
      { id:'t11', name:'Tosun',        jersey:'17', pos:'F',  photo: ss(155741), jerseyImg:null, formationPlace:11, rating:null },
    ],
    away: [
      { id:'p1',  name:'Silva',       jersey:'1',  pos:'GK', photo:null, jerseyImg:null, formationPlace:1,  rating:null },
      { id:'p2',  name:'Espínola',   jersey:'2',  pos:'D',  photo:null, jerseyImg:null, formationPlace:2,  rating:null },
      { id:'p3',  name:'Alonso',      jersey:'5',  pos:'D',  photo:null, jerseyImg:null, formationPlace:3,  rating:null },
      { id:'p4',  name:'Alderete',    jersey:'3',  pos:'D',  photo:null, jerseyImg:null, formationPlace:4,  rating:null },
      { id:'p5',  name:'Arzamendia', jersey:'4',  pos:'D',  photo:null, jerseyImg:null, formationPlace:5,  rating:null },
      { id:'p6',  name:'Cubas',       jersey:'6',  pos:'M',  photo:null, jerseyImg:null, formationPlace:6,  rating:null },
      { id:'p7',  name:'Sánchez',    jersey:'8',  pos:'M',  photo:null, jerseyImg:null, formationPlace:7,  rating:null },
      { id:'p8',  name:'Almada',      jersey:'10', pos:'M',  photo:null, jerseyImg:null, formationPlace:8,  rating:null },
      { id:'p9',  name:'Romero A.',  jersey:'7',  pos:'M',  photo:null, jerseyImg:null, formationPlace:9,  rating:null },
      { id:'p10', name:'Sanabria',    jersey:'9',  pos:'F',  photo:null, jerseyImg:null, formationPlace:10, rating:null },
      { id:'p11', name:'Bareiro',     jersey:'11', pos:'F',  photo:null, jerseyImg:null, formationPlace:11, rating:null },
    ],
  },
}

export const MOCK_SOFA_DATA = {
  [BRA_HAI]: {
    home: [
      { name:'Alisson',         jersey:'1',  photo:ss(159073),  rating:6.9, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Danilo',           jersey:'2',  photo:ss(138671),  rating:7.1, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Militao',          jersey:'3',  photo:ss(825516),  rating:7.2, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Marquinhos',       jersey:'4',  photo:ss(101964),  rating:7.4, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Wendell',          jersey:'6',  photo:null,         rating:6.8, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Casemiro',         jersey:'5',  photo:ss(168658),  rating:7.0, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Bruno Guimaraes', jersey:'8',  photo:ss(821514),  rating:7.6, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Paqueta',          jersey:'10', photo:ss(421459),  rating:7.3, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Rodrygo',          jersey:'11', photo:ss(876144),  rating:8.1, goals:1, assists:0, yellows:0, reds:0 },
      { name:'Vinicius Jr',      jersey:'7',  photo:ss(750710),  rating:8.4, goals:1, assists:0, yellows:0, reds:0 },
      { name:'Endrick',          jersey:'9',  photo:ss(1129718), rating:7.9, goals:1, assists:0, yellows:0, reds:0 },
    ],
    away: [
      { name:'Voltaire', jersey:'1',  photo:null, rating:4.8, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Salomon',  jersey:'2',  photo:null, rating:5.2, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Geffrard', jersey:'5',  photo:null, rating:5.0, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Joseph',   jersey:'4',  photo:null, rating:5.1, goals:0, assists:0, yellows:1, reds:0 },
      { name:'Bazile',   jersey:'3',  photo:null, rating:5.3, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Guerrier', jersey:'6',  photo:null, rating:5.5, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Delgado',  jersey:'8',  photo:null, rating:5.1, goals:0, assists:0, yellows:0, reds:0 },
      { name:'David',    jersey:'7',  photo:null, rating:4.9, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Leandre',  jersey:'9',  photo:null, rating:5.2, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Lala',     jersey:'11', photo:null, rating:5.4, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Casseus',  jersey:'10', photo:null, rating:5.0, goals:0, assists:0, yellows:0, reds:0 },
    ],
  },
  [TUR_PAR]: {
    home: [
      { name:'Gunok',       jersey:'1',  photo:ss(150040),  rating:7.0, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Celik',       jersey:'2',  photo:ss(753024),  rating:7.2, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Demiral',     jersey:'4',  photo:ss(798439),  rating:7.4, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Akaydin',     jersey:'5',  photo:null,         rating:7.0, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Kadioglu',    jersey:'3',  photo:ss(875684),  rating:7.5, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Calhanoglu',  jersey:'10', photo:ss(168719),  rating:8.0, goals:1, assists:0, yellows:0, reds:0 },
      { name:'Ozcan',       jersey:'8',  photo:ss(869354),  rating:6.7, goals:0, assists:0, yellows:1, reds:0 },
      { name:'Akturkoglu',  jersey:'11', photo:ss(878406),  rating:7.3, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Guler',       jersey:'9',  photo:ss(1039024), rating:7.6, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Kahveci',     jersey:'7',  photo:null,         rating:7.1, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Tosun',       jersey:'17', photo:ss(155741),  rating:6.9, goals:0, assists:0, yellows:0, reds:0 },
    ],
    away: [
      { name:'Silva',      jersey:'1',  photo:null, rating:6.8, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Espinola',   jersey:'2',  photo:null, rating:6.3, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Alonso',     jersey:'5',  photo:null, rating:6.1, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Alderete',   jersey:'3',  photo:null, rating:5.9, goals:0, assists:0, yellows:1, reds:0 },
      { name:'Arzamendia', jersey:'4',  photo:null, rating:6.5, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Cubas',      jersey:'6',  photo:null, rating:6.2, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Sanchez',    jersey:'8',  photo:null, rating:6.7, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Almada',     jersey:'10', photo:null, rating:7.2, goals:0, assists:1, yellows:0, reds:0 },
      { name:'Romero A',   jersey:'7',  photo:null, rating:6.8, goals:0, assists:0, yellows:0, reds:0 },
      { name:'Sanabria',   jersey:'9',  photo:null, rating:7.8, goals:1, assists:0, yellows:0, reds:0 },
      { name:'Bareiro',    jersey:'11', photo:null, rating:6.6, goals:0, assists:0, yellows:0, reds:0 },
    ],
  },
}

// fifaMap entries so center block shows live scores
export const MOCK_FIFA_MAP = {
  'BRA|HAI': { mk: BRA_HAI, state:'in', liveScore:[3,0], clock:'73', isHT:false,
    date: new Date().toISOString(), venue:'SoFi Stadium, Inglewood, CA', postScore:null },
  'HAI|TUR': null, // unused — just ensure correct keys
  'PAR|TUR': { mk: TUR_PAR, state:'in', liveScore:[1,1], clock:'68', isHT:false,
    date: new Date().toISOString(), venue:'AT&T Stadium, Arlington, TX', postScore:null },
}
