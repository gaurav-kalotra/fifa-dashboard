// National-team jersey numbers — keyed by both manifest abbreviation and full name
const NUMBERS = {
  // Belgium
  'T. Courtois':1, 'S. Lammens':23, 'M. Penders':12,
  'T. Castagne':2, 'Z. Debast':5, 'B. Mechele':6, 'T. Meunier':2,
  'K. De Bruyne':7, 'A. Saelemaekers':22, 'J. Doku':11, 'L. Trossard':19,
  'R. Lukaku':9, 'L. Openda':17,
  // France
  'M. Maignan':16, 'M. Gusto':17, 'M. Koné':8, 'B. Barcola':11,
  'M. Thuram':9, 'Kylian Mbappe':10, 'W. Saliba':17,
  // Croatia
  'D. Kotarski':12, 'L. Modrić':10, 'M. Kovacic':8, 'I. Perišić':4,
  // Brazil
  'Weverton':12, 'Alisson':1, 'Léo Pereira':5, 'Marquinhos':4,
  'Bruno Guimarães':5, 'Matheus Cunha':9, 'Raphinha':10,
  'Vinícius Júnior':7, 'Rodrygo':11, 'Endrick':9,
  // Uruguay
  'F. Muslera':1,
  // Spain
  'Lamine Yamal':19, 'Nico Williams':11, 'Fabián Ruiz':8, 'Joan García':13,
  'Eric García':24, 'Marc Pubill':21,
  // England
  'M. Guéhi':6, 'I. Toney':9, 'A. Gordon':11, 'E. Eze':7,
  'K. Moore':21,
  // Japan
  'K. Itakura':5, 'D. Maeda':15, 'D. Kamada':8,
  // Senegal
  'É. Mendy':1, 'P. Sarr':19, 'I. Mbaye':23,
  // Serbia
  'F. Kostić':6,
  // Switzerland
  'A. Amenda':4, 'R. Rodríguez':13, 'N. Okafor':7,
  // Mexico
  'J. Gallardo':3, 'E. Álvarez':6, 'R. Alvarado':22,
  // South Korea
  'Hwang Hee-Chan':11, 'Lee Dong-Gyeong':8,
  // Denmark
  'M. Hermansen':1, 'R. Kristensen':2, 'M. Damsgaard':7, 'P. Højbjerg':8, 'G. Isaksen':11,
  // Germany
  'A. Nübel':1, 'N. Schlotterbeck':5, 'L. Goretzka':8, 'K. Havertz':7,
  // Wales
  'T. King':1, 'B. Davies':3, 'K. Moore':10,
  // Netherlands
  'N. Aké':5, 'T. Reijnders':8, 'J. Kluivert':7, 'D. Malen':11,
  // Ghana
  'L. Zigi':1,
  // USA
  'W. McKennie':8, 'C. Pulisic':10, 'T. Weah':11,
  // Canada
  'C. Larin':9, 'L. Millar':19,
  // Argentina
  'Lisandro Martínez':14, 'C. Romero':17, 'A. Mac Allister':5, 'L. Messi':10,
  // Portugal
  'Rui Silva':1, 'Bruno Fernandes':8, 'Vitinha':16, 'Pedro Neto':11,
  // Morocco
  'Y. Bounou':1, 'B. El Khannouss':14,

  // Full-name aliases (for bottom ticker award items)
  'Lionel Messi':10, 'Kylian Mbappé':10, 'Erling Haaland':9,
  'Vinícius Júnior':7, 'Jude Bellingham':22,
  'Emiliano Martínez':23, 'Alisson Becker':1, 'Thibaut Courtois':1,
  'Mike Maignan':16, 'Yann Sommer':1,
  'Lamine Yamal':19, 'Endrick':9, 'Florian Wirtz':10,
  'Kobbie Mainoo':26, 'Mathys Tel':14,
}

export default NUMBERS

// National team lookup for players whose ESPN entry returns a club team or empty
export const PLAYER_TEAMS = {
  'Lionel Messi':'Argentina','Vinícius Júnior':'Brazil','Erling Haaland':'Norway',
  'Kylian Mbappé':'France','Jude Bellingham':'England',
  'Emiliano Martínez':'Argentina','Alisson Becker':'Brazil',
  'Thibaut Courtois':'Belgium','Mike Maignan':'France','Yann Sommer':'Switzerland',
  'Lamine Yamal':'Spain','Endrick':'Brazil','Florian Wirtz':'Germany',
  'Kobbie Mainoo':'England','Mathys Tel':'France',
  'Matheus Cunha':'Brazil','Raphinha':'Brazil','Bruno Guimarães':'Brazil',
  'Rodrygo':'Brazil','Weverton':'Brazil',
  'Harry Kane':'England','Bukayo Saka':'England','Phil Foden':'England',
  'Pedri':'Spain','Gavi':'Spain','Álvaro Morata':'Spain',
  'Karim Benzema':'France','Antoine Griezmann':'France','Ousmane Dembélé':'France',
  'Romelu Lukaku':'Belgium','Kevin De Bruyne':'Belgium',
  'Luka Modrić':'Croatia','Ivan Perišić':'Croatia',
  'Federico Valverde':'Uruguay','Darwin Núñez':'Uruguay',
  'Richarlison':'Brazil',
  'Jonathan David':'Canada','Cyle Larin':'Canada','Alphonso Davies':'Canada',
  'Christian Pulisic':'USA','Weston McKennie':'USA','Timothy Weah':'USA',
  'Ismael Saibari':'Netherlands','Brian Brobbey':'Netherlands',
  'Memphis Depay':'Netherlands','Virgil van Dijk':'Netherlands',
}
