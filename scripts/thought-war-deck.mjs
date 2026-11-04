// CYBER LIVE DESK — the Thought War deck.
// Ten philosophical dilemmas for the circle: ethics, metaphysics and social philosophy, the kind
// Kant, Socrates or Nietzsche would argue out in a Lagos sitting room. No party politics.
//
// Each entry is a desk card, so the deck rides the same queue, approval flow and overlay as a
// news story. Only headline, summary and question reach the audience: publicCard() drops
// presenterNotes, which is where the two sides live. Read them out; never put them on screen.
//
// Field limits are the server's own (api/_desk-core.mjs LIMITS). tests/thought-war.test.mjs puts
// every card through the real upsertCard, so an oversized field fails here rather than live.

export const DECK_TYPE = "thought-war";
export const DECK_CATEGORY = "thought-war";

// A dilemma needs longer on screen than a headline. The server accepts 5 to 300.
export const DECK_TTL_SEC = 120;

export const THOUGHT_WAR_DECK = [
  {
    headline: "The Religious Debt: did their tithes buy your success?",
    summary: "Your parents spent their life savings on tithes and seed-sowings to build a spiritual canopy over you. You are successful now and they are broke. They say your wealth is the harvest of that investment, so it belongs to them and the church.",
    question: "Side A: you owe them nothing. Side B: you pay for the peace of mind that built you. Where do you stand?",
    presenterNotes: `Dilemma: The Burden of Intercession

Side A (The Kantian Duty): You owe them nothing. They fell victim to religious manipulation and misallocated their capital. Giving them money now just validates a predatory system and funds their delusion.

Side B (The Communal Debt): Even if the mechanism was flawed, their intent was a sacrificial gamble for your future. Their psychological conviction gave them the stamina to raise you. You must pay the bill for the peace of mind that built you.`,
  },
  {
    headline: "The Enlightened Coward: is a truth that wrecks peace worth speaking?",
    summary: "You found a philosophical truth that freed you from existential dread, fear of death and social conditioning. Telling your community will collapse their religious and cultural foundations and cause real panic and instability.",
    question: "Side A: speak it at all costs. Side B: mercy beats intellectual purity. Would you tell?",
    presenterNotes: `Dilemma: The Price of Knowing Too Much

Side A (The Socratic Standard): Truth must be spoken at all costs. An unexamined life is not worth living, and a false peace built on comforting lies is a form of mental slavery.

Side B (The Utilitarian Mercy): Ignorance is bliss when the truth has no practical utility. If a myth keeps a community cohesive, peaceful and morally upright, shattering it for the sake of intellectual purity is an act of cruel egoism.`,
  },
  {
    headline: "The Stratified Conscience: did you escape the mud, or learn to enjoy it?",
    summary: "You climbed from the lower class into the ultra-wealthy. Holding the position and feeding your descendants means adopting the elite's cold habits, including turning a blind eye to the underpaid labour force that reminds you of your own childhood.",
    question: "Side A: the strong climb, guilt is sabotage. Side B: you became the monster you prayed against. Which are you?",
    presenterNotes: `Dilemma: Class Mobility vs Cultural Betrayal

Side A (The Nietzschean Will): You have evolved. Nature dictates that the strong climb. To look back and cripple your own ascension out of guilt for the lower class is to sabotage the survival of your own bloodline.

Side B (The Moral Imperative): You have become the monster you used to pray against. True power is not escaping the mud to exploit those left behind; it is using your leverage to break the machine. If you adapt to survive, you are already dead.`,
  },
  {
    headline: "The Genetic Prison: born with a violent brain, who carries the blame?",
    summary: "A person born into a lineage with a deep, scientifically proven genetic and environmental pull toward explosive anger and violent impulses commits a terrible, non-political offense against someone close to you.",
    question: "Side A: accountability is absolute. Side B: they never chose their brain chemistry. How do you judge them?",
    presenterNotes: `Dilemma: Determinism vs Personal Accountability

Side A (The Absolutist): Accountability is absolute. Every human possesses a rational mind capable of overriding impulse. To blame biology or upbringing is a weak cop-out that cheapens human agency; they must face full, unmerciful consequences.

Side B (The Determinist): They never chose their brain chemistry or their environment. Expecting them to act like a person born with a calm nervous system is mathematically unfair. Punish them to protect society, yes, but do it with pity, not moral superiority.`,
  },
  {
    headline: "The Acquisition of Power: can a clean plan win a dirty seat?",
    summary: "You have a flawless plan to fix a broken institution and eliminate corruption entirely. To be appointed to the top seat that executes it, you must first lie, compromise your morals, take bribes and play the current gatekeepers' dirty game.",
    question: "Side A: the means are the end, so refuse. Side B: soil your soul and save the collective. Pick a side.",
    presenterNotes: `Dilemma: Pure Means vs Necessary Evils

Side A (The Kantian Categorical Imperative): The means are the end. If you use corruption to gain power you pollute your character before you even sit on the throne. You cannot build a temple of justice using bricks of deceit.

Side B (The Pragmatic Deliverer): Purity is a luxury for the powerless. If you insist on keeping your hands clean, the wicked will rule forever. It is an act of supreme moral courage to soil your own soul temporarily if it means saving the collective in the end.`,
  },
  {
    headline: "The Prodigal Friend: loyalty to the one who fed you when you had nothing?",
    summary: "A childhood friend who stuck by you through your deepest poverty made a reckless, catastrophic choice that left them destitute and hunted by creditors. Pulling them fully out drains your hard-earned stability and risks your own family's security.",
    question: "Side A: walk away and your wealth is meaningless. Side B: do not drown trying to save them. Choose.",
    presenterNotes: `Dilemma: The Cost of Loyalty vs Self-Preservation

Side A (The Socratic/Aristotelian Virtue): Loyalty is not a fair-weather contract. If you abandon the person who shared their last slice of bread with you when you were nothing, your wealth is meaningless. True virtue requires you to risk your comfort to match their past sacrifice.

Side B (The Rational Egoist): You cannot drown yourself trying to save someone who jumped into the river with stones in their pockets. Your primary moral duty is to protect the stability you have built for your dependents. Nostalgia is an irrational reason to sabotage your future.`,
  },
  {
    headline: "The Revenue of the Damned: legal money built on your neighbours' ruin?",
    summary: "You are offered a life-changing sum to manage the logistics of a completely legal but morally devastating business, like mass-producing addictive gambling products for low-income communities, or buying up community farmland through loopholes.",
    question: "Side A: taking the job makes you the harm. Side B: someone worse takes it tomorrow. What is your answer?",
    presenterNotes: `Dilemma: Blood Money vs Pure Survival

Side A (The Kantian Principle): You are treating fellow human beings as a mere means to an end. By taking the job you become an active agent of human decay. If you build your family's inheritance on the broken lives of others, that money carries a moral curse.

Side B (The Market Realist): The vacancy exists with or without you. If you reject the position, an even more ruthless person will take it tomorrow, and the harm to the community will remain identical. You might as well secure the wealth and use it to do private good elsewhere.`,
  },
  {
    headline: "The Genealogy of Appreciation: do you owe the mentor who used you?",
    summary: "A powerful mentor took you in when you were desperate and gave you your first big break, while routinely humiliating you, underpaying you and extracting massive value from your labour. Now that you are independent they demand deep deference and public credit.",
    question: "Side A: staying grateful is slave mentality. Side B: honour the bridge anyway. What do you owe them?",
    presenterNotes: `Dilemma: The Debt of Exploitative Mentorship

Side A (The Nietzschean Break): The mentor did not act out of charity; they acted out of opportunism. They used your vulnerability for cheap labour. You paid your dues in sweat and tears. To remain subordinate out of gratitude is a slave mentality.

Side B (The Communal Balance): Regardless of their toxic methodology, they were the bridge you walked across to escape obscurity. Without their platform your talent would have rotted in silence. You must honour the bridge, even if the architect was cruel.`,
  },
  {
    headline: "The Tyranny of the Infirm: your destiny, or one suffering life?",
    summary: "A chronically ill relative needs round-the-clock emotional and physical care that only you can provide. Pausing your life for them means walking completely away from an incredibly rare international opportunity that would launch your career.",
    question: "Side A: a suffering soul outranks ambition. Side B: bad moral mathematics. Sit with it and choose.",
    presenterNotes: `Dilemma: Absolute Altruism vs Personal Destiny

Side A (The Altruistic Duty): A human life in agony is an immediate, absolute moral emergency. Sacrificing your ambition to comfort a suffering soul in their final years is the ultimate expression of human nobility. Ambition is just vanity; love is real.

Side B (The Utilitarian Trajectory): You are trading a massive, high-impact future where you could lift thousands of people out of poverty for the temporary comfort of one person. It is bad moral mathematics to cripple a great future for a losing battle against mortality.`,
  },
  {
    headline: "The Artificial Sanctuary: break the lie that is keeping someone alive?",
    summary: "A close friend, shattered by grief, is convinced their lost loved one sends them daily signs, and it is the only thing keeping them from ending their life. You hold absolute, undeniable proof that the signs are natural coincidences.",
    question: "Side A: shatter the illusion, truth heals. Side B: let them keep the beautiful lie. Which do you choose?",
    presenterNotes: `Dilemma: The Matrix of Consolation

Side A (The Socratic Intervention): A life lived in a psychological hallucination is a compromised life. You must gently but firmly shatter the illusion. Truth is the only firm foundation upon which a human being can genuinely heal and grow.

Side B (The Compassionate Pragmatist): Truth is a weapon that can kill. If a psychological placebo is actively keeping a human being alive and stable, taking it away in the name of objectivity is an act of intellectual cruelty. Let them keep their beautiful lie.`,
  },
];
