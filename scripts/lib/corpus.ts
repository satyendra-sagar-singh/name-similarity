/**
 * Seed name corpus for benchmark generation.
 *
 * Grouped by naming tradition so that negative pairs can be drawn from the
 * *same* tradition. Pairing a Polish surname against a Tamil one produces a
 * trivially easy negative and inflates every metric.
 */

export interface CorpusGroup {
  culture: string;
  given: string[];
  surnames: string[];
  /** Middle names that are idiomatic for this group. */
  middles: string[];
}

export const CORPUS: CorpusGroup[] = [
  {
    culture: 'anglo',
    given: [
      'John', 'Michael', 'David', 'James', 'Robert', 'William', 'Thomas', 'Christopher',
      'Daniel', 'Matthew', 'Andrew', 'Joseph', 'Richard', 'Charles', 'Benjamin',
      'Emily', 'Sarah', 'Jessica', 'Rebecca', 'Laura', 'Hannah', 'Charlotte', 'Olivia',
      'Amelia', 'Grace', 'Victoria', 'Natalie', 'Melissa', 'Rachel', 'Caroline',
    ],
    middles: ['Alexander', 'Edward', 'Louise', 'Anne', 'James', 'Marie', 'Grace', 'Patrick'],
    surnames: [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Robinson',
      'Wright', 'Thompson', 'Walker', 'Harrison', 'Baker', 'Turner', 'Mitchell',
      'Cooper', 'Richardson', 'Bennett', 'Foster', 'Hughes', 'Morgan', 'Ellis',
      'Fitzgerald', 'Sutherland', 'Whitfield', 'Ashworth', 'Pemberton', 'Kingsley',
    ],
  },
  {
    culture: 'hispanic',
    given: [
      'Jose', 'Carlos', 'Miguel', 'Antonio', 'Francisco', 'Javier', 'Alejandro', 'Diego',
      'Ricardo', 'Fernando', 'Eduardo', 'Rafael', 'Sergio', 'Pablo',
      'Maria', 'Carmen', 'Ana', 'Isabel', 'Lucia', 'Elena', 'Sofia', 'Valentina',
      'Gabriela', 'Patricia', 'Beatriz',
    ],
    middles: ['Luis', 'Antonio', 'Jose', 'Isabel', 'Teresa', 'Manuel'],
    surnames: [
      'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez',
      'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Gomez', 'Diaz', 'Cruz',
      'Morales', 'Ortiz', 'Castillo', 'Vargas', 'Mendoza', 'Guerrero', 'Delgado',
      'Fuentes', 'Escobar', 'Navarro', 'Salazar',
    ],
  },
  {
    culture: 'south-asian',
    given: [
      'Rahul', 'Amit', 'Sanjay', 'Vijay', 'Ajay', 'Deepak', 'Manoj', 'Suresh', 'Ramesh',
      'Rohit', 'Ankit', 'Gaurav', 'Vivek', 'Arun', 'Nikhil', 'Siddharth', 'Aditya',
      'Priya', 'Neha', 'Pooja', 'Divya', 'Anjali', 'Kavita', 'Sunita', 'Shweta', 'Meera',
    ],
    middles: ['Kumar', 'Chandra', 'Prasad', 'Devi', 'Rani', 'Nath'],
    surnames: [
      'Sharma', 'Verma', 'Gupta', 'Patel', 'Singh', 'Reddy', 'Nair', 'Menon', 'Iyer',
      'Joshi', 'Mehta', 'Desai', 'Kulkarni', 'Deshpande', 'Chatterjee', 'Banerjee',
      'Mukherjee', 'Srivastava', 'Agarwal', 'Chaudhary', 'Tiwari', 'Pandey', 'Mishra',
      'Bhattacharya', 'Ramakrishnan', 'Venkatesan',
    ],
  },
  {
    culture: 'arabic',
    given: [
      'Mohammad', 'Ahmed', 'Ali', 'Omar', 'Khalid', 'Hassan', 'Ibrahim', 'Yusuf',
      'Tariq', 'Karim', 'Bilal', 'Hamza', 'Faisal', 'Nasser', 'Rashid',
      'Fatima', 'Aisha', 'Maryam', 'Zainab', 'Khadija', 'Layla', 'Noor', 'Salma',
    ],
    middles: ['Abdul', 'Bin', 'Al', 'Bint'],
    surnames: [
      'Khan', 'Rahman', 'Hussain', 'Malik', 'Siddiqui', 'Ansari', 'Qureshi', 'Farooqi',
      'Chowdhury', 'Haddad', 'Nasser', 'Mansour', 'Aziz', 'Rashid', 'Saleh', 'Hakim',
      'Baghdadi', 'Tikriti', 'Halabi', 'Masri',
    ],
  },
  {
    culture: 'east-asian',
    given: [
      'Wei', 'Ming', 'Jun', 'Hui', 'Yan', 'Feng', 'Lei', 'Tao', 'Xin', 'Jing',
      'Minjun', 'Jihoon', 'Seoyeon', 'Haruto', 'Yuki', 'Sakura', 'Ren',
    ],
    middles: ['Ling', 'Hua', 'Ping'],
    surnames: [
      'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou',
      'Kim', 'Park', 'Choi', 'Jeong', 'Nakamura', 'Tanaka', 'Suzuki', 'Watanabe',
      'Nguyen', 'Tran', 'Pham',
    ],
  },
  {
    culture: 'germanic',
    given: [
      'Hans', 'Klaus', 'Wolfgang', 'Jurgen', 'Dieter', 'Stefan', 'Andreas', 'Matthias',
      'Lars', 'Erik', 'Anders', 'Sven', 'Johan', 'Nils',
      'Ingrid', 'Astrid', 'Greta', 'Petra', 'Ursula', 'Annika', 'Sigrid',
    ],
    middles: ['Otto', 'Wilhelm', 'Marie', 'Elisabeth'],
    surnames: [
      'Schmidt', 'Muller', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
      'Hoffmann', 'Schafer', 'Andersen', 'Larsson', 'Nilsson', 'Bergman', 'Lindqvist',
      'Johansson', 'Hansen', 'Pedersen', 'Kristensen', 'Vandenberg', 'Bakker',
    ],
  },
  {
    culture: 'slavic',
    given: [
      'Vladimir', 'Dmitry', 'Sergey', 'Andrey', 'Nikolay', 'Mikhail', 'Alexei', 'Pavel',
      'Piotr', 'Jakub', 'Marek', 'Tomasz', 'Zbigniew',
      'Natalia', 'Tatiana', 'Ekaterina', 'Anastasia', 'Agnieszka', 'Katarzyna',
    ],
    middles: ['Ivanovich', 'Petrovich', 'Sergeevna'],
    surnames: [
      'Ivanov', 'Petrov', 'Smirnov', 'Kuznetsov', 'Popov', 'Volkov', 'Sokolov',
      'Kowalski', 'Nowak', 'Wisniewski', 'Kowalczyk', 'Zielinski', 'Szymanski',
      'Novak', 'Svoboda', 'Horvat', 'Dvorak', 'Marinov', 'Georgiev',
    ],
  },
  {
    culture: 'african',
    given: [
      'Kwame', 'Kofi', 'Chinedu', 'Emeka', 'Oluwaseun', 'Babatunde', 'Sipho', 'Thabo',
      'Amara', 'Nneka', 'Adaeze', 'Zanele', 'Ayanda', 'Folake',
    ],
    middles: ['Chukwu', 'Ade', 'Nana'],
    surnames: [
      'Okafor', 'Okonkwo', 'Adeyemi', 'Adebayo', 'Nkrumah', 'Mensah', 'Owusu',
      'Dlamini', 'Mokoena', 'Ndlovu', 'Mwangi', 'Kamau', 'Otieno', 'Abebe', 'Tesfaye',
    ],
  },
  {
    culture: 'romance',
    given: [
      'Marco', 'Luca', 'Giovanni', 'Alessandro', 'Matteo', 'Francesco', 'Lorenzo',
      'Pierre', 'Jacques', 'Olivier', 'Thierry', 'Laurent', 'Sebastien',
      'Giulia', 'Francesca', 'Chiara', 'Camille', 'Amelie', 'Celine',
    ],
    middles: ['Maria', 'Paolo', 'Jean', 'Marie'],
    surnames: [
      'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo',
      'Ricci', 'Marino', 'Greco', 'Dubois', 'Bernard', 'Petit', 'Durand', 'Leroy',
      'Moreau', 'Laurent', 'Lefebvre', 'Fontaine', 'Chevalier',
    ],
  },
];

/** Every surname in the corpus, for near-miss negative generation. */
export const ALL_SURNAMES: string[] = CORPUS.flatMap((group) => group.surnames);
export const ALL_GIVEN: string[] = CORPUS.flatMap((group) => group.given);

/**
 * Spelling substitutions that preserve pronunciation.
 *
 * Independent of the package's phonetic implementation on purpose: generating
 * these from Double Metaphone would test the algorithm against itself.
 */
export const PHONETIC_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/ph/gi, 'f'],
  [/^c(?=[aou])/i, 'k'],
  [/ck/gi, 'k'],
  [/x/gi, 'ks'],
  [/z/gi, 's'],
  [/ie/gi, 'ei'],
  [/ei(?!n)/gi, 'ie'],
  [/y$/i, 'ie'],
  [/tt/gi, 't'],
  [/ll/gi, 'l'],
  [/nn/gi, 'n'],
  [/ss(?!on)/gi, 's'],
  [/ae/gi, 'e'],
  [/oo/gi, 'u'],
  [/ou/gi, 'u'],
];

/** Latin letters that commonly acquire a diacritic in source records. */
export const ACCENT_SUBSTITUTIONS: Record<string, string> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  n: 'ñ',
  c: 'ç',
  s: 'š',
  z: 'ż',
};

export const TITLES = ['Dr.', 'Mr.', 'Mrs.', 'Prof.', 'Ms.', 'Er.', 'Capt.'];
export const SUFFIXES = ['Jr', 'Sr', 'PhD', 'MD', 'Esq', 'III'];
