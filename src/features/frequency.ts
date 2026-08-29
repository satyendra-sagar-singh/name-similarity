import { ENGLISH_NICKNAMES, NICKNAMES } from '../aliases/default.js';

/**
 * Name frequency tiers.
 *
 * Agreement on a rare token is much stronger evidence than agreement on a
 * common one: two `Zbigniew Kowalczyk` records are almost certainly the same
 * person, two `John Smith` records very often are not. Exact frequencies would
 * be locale-specific and large, so three coarse tiers carry the signal instead.
 */

const VERY_COMMON_GIVEN = new Set([
  'john',
  'james',
  'robert',
  'michael',
  'william',
  'david',
  'richard',
  'joseph',
  'thomas',
  'charles',
  'mary',
  'patricia',
  'jennifer',
  'linda',
  'elizabeth',
  'barbara',
  'susan',
  'jessica',
  'sarah',
  'karen',
  'mohammad',
  'muhammad',
  'mohammed',
  'ahmed',
  'ahmad',
  'ali',
  'hassan',
  'omar',
  'fatima',
  'aisha',
  'kumar',
  'singh',
  'raj',
  'ram',
  'krishna',
  'ravi',
  'anil',
  'sunil',
  'amit',
  'priya',
  'wei',
  'li',
  'ming',
  'hui',
  'yan',
  'jose',
  'juan',
  'maria',
  'carlos',
  'luis',
]);

const COMMON_GIVEN = new Set([
  'christopher',
  'daniel',
  'matthew',
  'anthony',
  'mark',
  'donald',
  'steven',
  'paul',
  'andrew',
  'joshua',
  'kenneth',
  'kevin',
  'brian',
  'george',
  'edward',
  'ronald',
  'timothy',
  'jason',
  'jeffrey',
  'ryan',
  'nancy',
  'lisa',
  'margaret',
  'betty',
  'sandra',
  'ashley',
  'dorothy',
  'kimberly',
  'emily',
  'donna',
  'michelle',
  'carol',
  'amanda',
  'melissa',
  'deborah',
  'stephanie',
  'rebecca',
  'laura',
  'helen',
  'sharon',
  'ibrahim',
  'yusuf',
  'khalid',
  'abdul',
  'rahman',
  'karim',
  'saeed',
  'tariq',
  'bilal',
  'hamza',
  'rahul',
  'rohit',
  'vijay',
  'ajay',
  'sanjay',
  'deepak',
  'manoj',
  'suresh',
  'ramesh',
  'anita',
  'sunita',
  'pooja',
  'neha',
  'divya',
  'kavita',
  'antonio',
  'francisco',
  'manuel',
  'pedro',
  'miguel',
  'ana',
  'carmen',
  'rosa',
  'laura',
  'sofia',
]);

const VERY_COMMON_SURNAME = new Set([
  'smith',
  'johnson',
  'williams',
  'brown',
  'jones',
  'garcia',
  'miller',
  'davis',
  'rodriguez',
  'martinez',
  'hernandez',
  'lopez',
  'gonzalez',
  'wilson',
  'anderson',
  'thomas',
  'taylor',
  'moore',
  'jackson',
  'martin',
  'lee',
  'perez',
  'thompson',
  'white',
  'harris',
  'sanchez',
  'clark',
  'ramirez',
  'lewis',
  'robinson',
  'wang',
  'li',
  'zhang',
  'liu',
  'chen',
  'yang',
  'huang',
  'zhao',
  'wu',
  'zhou',
  'kim',
  'park',
  'choi',
  'nguyen',
  'tran',
  'singh',
  'kumar',
  'sharma',
  'patel',
  'khan',
  'ahmed',
  'ali',
  'hussain',
  'rahman',
  'islam',
  'devi',
  'das',
  'shah',
  'gupta',
  'yadav',
]);

const COMMON_SURNAME = new Set([
  'walker',
  'young',
  'allen',
  'king',
  'wright',
  'scott',
  'torres',
  'nguyen',
  'hill',
  'flores',
  'green',
  'adams',
  'nelson',
  'baker',
  'hall',
  'rivera',
  'campbell',
  'mitchell',
  'carter',
  'roberts',
  'murphy',
  'kelly',
  'cook',
  'morgan',
  'bell',
  'bailey',
  'cooper',
  'richardson',
  'cox',
  'howard',
  'ward',
  'peterson',
  'gray',
  'ramos',
  'james',
  'watson',
  'brooks',
  'kelly',
  'sanders',
  'price',
  'bennett',
  'wood',
  'barnes',
  'ross',
  'henderson',
  'coleman',
  'jenkins',
  'perry',
  'powell',
  'long',
  'schmidt',
  'mueller',
  'schneider',
  'fischer',
  'weber',
  'meyer',
  'wagner',
  'becker',
  'hoffmann',
  'silva',
  'santos',
  'oliveira',
  'souza',
  'pereira',
  'costa',
  'ferreira',
  'rossi',
  'russo',
  'ferrari',
  'esposito',
  'bianchi',
  'romano',
  'dubois',
  'martin',
  'bernard',
  'petit',
  'durand',
  'leroy',
  'ivanov',
  'petrov',
  'smirnov',
  'kuznetsov',
  'popov',
  'reddy',
  'nair',
  'menon',
  'iyer',
  'mishra',
  'verma',
  'joshi',
  'mehta',
  'agarwal',
  'chauhan',
  'pandey',
  'tiwari',
  'malik',
  'chowdhury',
  'siddiqui',
]);

/**
 * Additional attested given names, used only for the "both of these are real,
 * different names" test — not for rarity.
 */
const EXTRA_GIVEN = [
  'marco', 'mario', 'marc', 'marcus', 'marcos', 'martin', 'marta', 'marina',
  'aaron', 'erin', 'arun', 'arjun', 'varun', 'karan', 'kiran', 'kieran',
  'jan', 'jane', 'jean', 'joan', 'john', 'jon', 'juan', 'ivan', 'ivano',
  'dan', 'don', 'dean', 'ben', 'bob', 'rob', 'ron', 'roy', 'ray', 'rex',
  'ming', 'jing', 'ling', 'bing', 'ning', 'ping', 'qing', 'xing', 'ying',
  'wei', 'mei', 'lei', 'fei', 'hui', 'rui', 'jun', 'yun', 'kun', 'xun',
  'tao', 'hao', 'bao', 'gao', 'yan', 'yang', 'yong', 'feng', 'peng', 'zhen',
  'amit', 'ankit', 'rohit', 'mohit', 'sumit', 'lalit', 'ranjit', 'arpit',
  'sanjay', 'sanjiv', 'sanjeev', 'rajiv', 'rajesh', 'ramesh', 'naresh',
  'mahesh', 'dinesh', 'mukesh', 'hitesh', 'ritesh', 'nilesh', 'jignesh',
  'aditya', 'aditi', 'ananya', 'ananth', 'arnav', 'aarav', 'atharv',
  'hassan', 'hussain', 'hasan', 'husain', 'hussein', 'hasnain',
  'salim', 'salman', 'sultan', 'suhail', 'sohail', 'shoaib', 'shakil',
  'nadir', 'nasir', 'nazir', 'nabil', 'nadim', 'nadeem', 'naeem',
  'stefan', 'stephan', 'stephen', 'steven', 'stefano', 'stephane',
  'andre', 'andrea', 'andres', 'andrew', 'anders', 'andrei', 'andrej', 'andreas',
  'matthias', 'mathias', 'matthijs', 'jurgen', 'juergen', 'dieter', 'gunter',
  'petr', 'peter', 'pieter', 'pietro', 'pedro', 'pablo', 'paolo', 'paul',
  'lars', 'lasse', 'leif', 'nils', 'niels', 'knut', 'bjorn', 'sven',
  'erik', 'erika', 'erica', 'eric', 'derek', 'dirk',
  'ana', 'anna', 'anne', 'ann', 'anita', 'anya', 'anja', 'antonia',
  'sara', 'sarah', 'sana', 'sonia', 'sofia', 'sophia', 'silvia', 'sylvia',
  'lena', 'lina', 'nina', 'mina', 'tina', 'rina', 'gina', 'dina',
  'noor', 'nour', 'nur', 'nora', 'dora', 'cora', 'lora', 'laura', 'lara',
  'kwame', 'kofi', 'kojo', 'kwaku', 'yaw', 'kwabena',
  'grace', 'gracie', 'greta',
  // Indian given names. Romanisation of Indic names has no standard, so the
  // orthographic folds above must recognise the variants *before* this list
  // makes the engine treat two spellings as two different people.
  'aadi', 'aarav', 'abhay', 'abhishek', 'aditya', 'ajay', 'ajit', 'akash', 'akhil',
  'akshay', 'alok', 'aman', 'amar', 'amit', 'amol', 'anand', 'anil', 'anirudh',
  'ankit', 'ankur', 'anoop', 'anup', 'anshul', 'anuj', 'anurag', 'arjun', 'arun',
  'ashish', 'ashok', 'atul', 'avinash', 'ayush', 'balaji', 'bharat', 'bhaskar',
  'bhavesh', 'chetan', 'chirag', 'darshan', 'deepak', 'dev', 'dhruv', 'dinesh',
  'gagan', 'ganesh', 'gaurav', 'girish', 'gopal', 'govind', 'harish', 'harsh',
  'hemant', 'hitesh', 'jagdish', 'jatin', 'jitendra', 'kailash', 'kamal', 'karan',
  'kartik', 'kaushik', 'keshav', 'kiran', 'krishna', 'kunal', 'lalit', 'madhav',
  'mahesh', 'manish', 'manoj', 'mayank', 'mihir', 'milind', 'mohan', 'mohit',
  'mukesh', 'murali', 'naresh', 'navin', 'nikhil', 'nilesh', 'nitin', 'pankaj',
  'paras', 'parth', 'pawan', 'piyush', 'prabhat', 'pradeep', 'prakash', 'pramod',
  'pranav', 'prashant', 'prateek', 'praveen', 'prem', 'puneet', 'raghav', 'rahul',
  'rajan', 'rajat', 'rajeev', 'rajiv', 'rajendra', 'rajesh', 'rakesh', 'raman',
  'ramesh', 'ranjan', 'ranjit', 'rishabh', 'rishi', 'rohan', 'rohit', 'rupesh',
  'sachin', 'sagar', 'sahil', 'sameer', 'sandeep', 'sanjay', 'sanjiv', 'sankar',
  'santosh', 'satish', 'satyendra', 'saurabh', 'shailesh', 'shankar', 'shashank',
  'shashi', 'shiv', 'shyam', 'siddharth', 'sohan', 'subhash', 'sudhir', 'sujit',
  'suman', 'sumit', 'sunil', 'suraj', 'suresh', 'sushil', 'swapnil', 'tarun',
  'tejas', 'tushar', 'uday', 'umesh', 'utkarsh', 'varun', 'vedant', 'venkat',
  'vijay', 'vikas', 'vikram', 'vimal', 'vinay', 'vinod', 'vipin', 'vishal',
  'vishnu', 'vivek', 'yash', 'yogesh',
  'aarti', 'aditi', 'akanksha', 'alka', 'amrita', 'anita', 'anjali', 'anju',
  'ankita', 'anupama', 'aparna', 'archana', 'asha', 'ashwini', 'bharti', 'bhavana',
  'chandni', 'charu', 'chitra', 'deepa', 'deepika', 'deepti', 'divya', 'ekta',
  'gauri', 'geeta', 'gita', 'hema', 'indu', 'isha', 'jaya', 'jyoti', 'kajal',
  'kalpana', 'kamini', 'kanchan', 'kavita', 'komal', 'kriti', 'lata', 'lakshmi',
  'laxmi', 'madhu', 'mala', 'malini', 'mamta', 'manisha', 'meena', 'meera',
  'megha', 'mona', 'monika', 'nandini', 'neelam', 'neeta', 'neha', 'nidhi',
  'nikita', 'nisha', 'nita', 'padma', 'pallavi', 'parul', 'payal', 'pooja',
  'poonam', 'prachi', 'preeti', 'prerna', 'priya', 'priyanka', 'radha', 'rajni',
  'rakhi', 'rani', 'rashmi', 'reena', 'rekha', 'renu', 'richa', 'riya', 'ruchi',
  'rupa', 'sangeeta', 'sanjana', 'saraswati', 'sarita', 'savita', 'seema',
  'shalini', 'shanti', 'sharda', 'sheela', 'shilpa', 'shobha', 'shreya', 'shruti',
  'shweta', 'simran', 'smita', 'sneha', 'sonal', 'sonia', 'sudha', 'sunita',
  'supriya', 'surbhi', 'sushma', 'swati', 'tanvi', 'tara', 'trupti', 'uma',
  'urmila', 'usha', 'vaishali', 'vandana', 'varsha', 'veena', 'vidya', 'vinita',
  'mahmoud', 'mahmood', 'mahmud', 'mehmood', 'muhammad', 'mohamed', 'muhammed',
  'sofia', 'sophia', 'sophie', 'sofie', 'nicolas', 'nicole', 'nicholas',
];

/** Additional attested surnames, kept separate from given names. */
const EXTRA_SURNAMES = [
  'clark', 'clarke', 'clarkson', 'gray', 'blake', 'black', 'block',
  'brown', 'browne', 'browning', 'bruno', 'bruns',
  'johnston', 'johnstone', 'johansson', 'jonsson', 'jansen', 'janssen',
  'nilsson', 'larsson', 'larsen', 'lassen', 'nielsen', 'nilsen',
  'sokolov', 'smirnov', 'volkov', 'popov', 'petrov', 'orlov', 'frolov',
  'schmidt', 'schafer', 'schaefer', 'schroder', 'schulz', 'schulze',
  'walker', 'baker', 'barker', 'parker', 'harker', 'marker',
  'ferrari', 'ferraro', 'ferrara', 'bernard', 'bernardi', 'bernardo',
  'tanaka', 'tran', 'trang', 'truong', 'tang', 'teng',
  'flores', 'fuentes', 'fontes', 'torres', 'tores',
  'ricci', 'rizzo', 'russo', 'rosso', 'rossi',
  'nowak', 'novak', 'novakovic', 'kowal', 'kowalski', 'kowalczyk',
  'okafor', 'okonkwo', 'okoye', 'okeke', 'obi', 'eze',
  'wu', 'wang', 'wong', 'huang', 'hwang', 'fang', 'zhang', 'chang',
  'andersen', 'anderson', 'pedersen', 'petersen', 'peterson', 'pederson',
  'jorgensen', 'christensen', 'rasmussen', 'sorensen', 'madsen', 'olsen',
  'hansen', 'hanson', 'jensen', 'jenson', 'eriksen', 'erickson',
  // Indian surnames.
  'acharya', 'agarwal', 'aggarwal', 'agrawal', 'ahluwalia', 'ahuja', 'arora',
  'awasthi', 'bajaj', 'banerjee', 'bansal', 'basu', 'batra', 'bedi', 'bhagat',
  'bhandari', 'bhardwaj', 'bhat', 'bhatia', 'bhatt', 'bhattacharya', 'bhosale',
  'biswas', 'bose', 'chadha', 'chakraborty', 'chandra', 'chatterjee', 'chaturvedi',
  'chauhan', 'chavan', 'chawla', 'chopra', 'choudhary', 'chowdhury', 'dalal',
  'das', 'dasgupta', 'deshmukh', 'deshpande', 'desai', 'devi', 'dhawan', 'dixit',
  'dubey', 'dutta', 'gandhi', 'ganguly', 'garg', 'gaikwad', 'ghosh', 'gill',
  'goel', 'goswami', 'goyal', 'grewal', 'gupta', 'iyengar', 'iyer', 'jain',
  'jaiswal', 'jha', 'jindal', 'joshi', 'kadam', 'kakkar', 'kamble', 'kapadia',
  'kapoor', 'kaul', 'kaur', 'khanna', 'khatri', 'kohli', 'kulkarni', 'kumar',
  'mahajan', 'maheshwari', 'majumdar', 'malhotra', 'malik', 'mandal', 'mathur',
  'mehra', 'mehta', 'menon', 'mishra', 'misra', 'mittal', 'modi', 'mukherjee',
  'murthy', 'nadar', 'nagpal', 'naidu', 'nair', 'nanda', 'narang', 'narayanan',
  'nath', 'nayak', 'nayar', 'negi', 'oberoi', 'pai', 'panda', 'pandey', 'pandit',
  'pant', 'parekh', 'patel', 'pathak', 'patil', 'pawar', 'pillai', 'prabhu',
  'prasad', 'puri', 'raghavan', 'rai', 'raina', 'rana', 'rao', 'rathore', 'raut',
  'reddy', 'roy', 'sachdeva', 'sah', 'sahni', 'saini', 'saxena', 'sen', 'sengupta',
  'seth', 'sethi', 'shah', 'sharma', 'shetty', 'shinde', 'shukla', 'singh',
  'singhal', 'sinha', 'soni', 'sood', 'srinivasan', 'srivastava', 'subramanian',
  'sundaram', 'suri', 'swamy', 'talwar', 'tandon', 'thakur', 'thakkar', 'tiwari',
  'trivedi', 'tyagi', 'vaidya', 'varma', 'varghese', 'venkatesan', 'verma',
  'vohra', 'wadhwa', 'walia', 'yadav',
  'bakker', 'becker', 'bakers', 'dekker', 'decker', 'visser', 'visscher',
  'lindqvist', 'lindgren', 'kristensen', 'christensen', 'vandenberg',
  'schafer', 'schaffer', 'schroeder', 'schuster', 'stein', 'steiner',
];

const ATTESTED_GIVEN = new Set<string>([
  ...VERY_COMMON_GIVEN,
  ...COMMON_GIVEN,
  ...EXTRA_GIVEN,
  // Derived rather than duplicated: both nickname tables hold given names only
  // (the variant table mixes in surnames, so it is deliberately excluded), and
  // one list cannot drift from itself.
  ...NICKNAMES.flat(),
  ...ENGLISH_NICKNAMES.flat(),
]);

const ATTESTED_SURNAME = new Set<string>([
  ...VERY_COMMON_SURNAME,
  ...COMMON_SURNAME,
  ...EXTRA_SURNAMES,
]);

const ATTESTED = new Set<string>([...ATTESTED_GIVEN, ...ATTESTED_SURNAME]);

/**
 * True when the token is a name people are actually given.
 *
 * Used for a single, specific inference: when two tokens are *both* attested
 * names and are not known variants of each other, a one-character difference
 * between them is far more likely to be two different names than a typo.
 * `Marco` and `Mario` are not a misspelling of one another.
 */
export function isAttestedName(token: string): boolean {
  return ATTESTED.has(token);
}

/**
 * True when the token is used as a given name.
 *
 * Distinguished from surnames because the same orthographic difference means
 * opposite things in each slot: `Simon` -> `Simone` marks a different person,
 * while `Clark` -> `Clarke` is one family name spelled two ways.
 */
export function isAttestedGivenName(token: string): boolean {
  return ATTESTED_GIVEN.has(token);
}

/** Rarity multiplier for a token, `0..1`. Higher means more discriminating. */
export function tokenRarity(token: string): number {
  if (token.length <= 1) return 0.2;
  if (VERY_COMMON_GIVEN.has(token) || VERY_COMMON_SURNAME.has(token)) return 0.35;
  if (COMMON_GIVEN.has(token) || COMMON_SURNAME.has(token)) return 0.6;
  // Very short tokens carry little information even when unlisted.
  if (token.length === 2) return 0.4;
  if (token.length === 3) return 0.75;
  return 1;
}

export function isVeryCommon(token: string): boolean {
  return VERY_COMMON_GIVEN.has(token) || VERY_COMMON_SURNAME.has(token);
}

/**
 * How much *identifying* agreement a pair shows.
 *
 * Two factors, because both matter and they are independent:
 *
 *  - coverage: what share of the discriminating material agreed, with rarer
 *    tokens carrying more weight and unmatched tokens counting against it;
 *  - distinctiveness: how rare the agreeing tokens are.
 *
 * The second factor is the point. Without it two matching `John Smith` records
 * and two matching `Zbigniew Kowalczyk` records look identical, when the second
 * is far stronger evidence of the same person.
 */
export function rarityWeightedAgreement(
  pairs: ReadonlyArray<{ a: string; b: string; score: number }>,
  unmatched: readonly string[],
): number {
  let weightedScore = 0;
  let totalWeight = 0;
  let matchedRarity = 0;
  let matchedCount = 0;

  for (const pair of pairs) {
    const weight = Math.max(tokenRarity(pair.a), tokenRarity(pair.b));
    weightedScore += weight * pair.score;
    totalWeight += weight;
    matchedRarity += weight * pair.score;
    matchedCount += pair.score;
  }
  for (const token of unmatched) {
    totalWeight += tokenRarity(token);
  }

  if (totalWeight === 0) return 0;
  const coverage = weightedScore / totalWeight;
  const distinctiveness = matchedCount === 0 ? 0 : matchedRarity / matchedCount;
  return coverage * distinctiveness;
}
