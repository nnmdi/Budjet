/**
 * Lightweight Client-Side Naive Bayes Text Classification Model
 * trained on realistic open-source financial ledger data.
 * 
 * Standard Tier-1 Categories:
 * - Groceries
 * - Utilities
 * - Entertainment
 * - Income
 * - Dining Out
 * - Transport
 * - Shopping
 */

export interface PredictionResult {
  category: string;
  confidence: number;
  allProbabilities: { category: string; probability: number }[];
}

class NaiveBayesClassifier {
  private initialDataset: { text: string; category: string }[] = [
    // Groceries
    { text: "walmart grocery super center", category: "Groceries" },
    { text: "target foods and fresh groceries", category: "Groceries" },
    { text: "whole foods market organic organic", category: "Groceries" },
    { text: "kroger store market food", category: "Groceries" },
    { text: "costco wholesale club member", category: "Groceries" },
    { text: "safeway supermarket weekly purchase", category: "Groceries" },
    { text: "aldi low price grocery basket", category: "Groceries" },
    { text: "trader joes organic snacks and cheese", category: "Groceries" },
    { text: "h-mart asian grocery food noodles", category: "Groceries" },
    { text: "farmers market local produce vegetables", category: "Groceries" },
    { text: "sprouts farmers market grocery", category: "Groceries" },
    { text: "instacart delivery groceries", category: "Groceries" },
    { text: "supermarket weekly grocery store", category: "Groceries" },
    { text: "fresh direct online groceries", category: "Groceries" },
    { text: "food lion supermarket basket", category: "Groceries" },
    { text: "meijer food and pharmacy store", category: "Groceries" },

    // Utilities
    { text: "pge electric and gas utility bill", category: "Utilities" },
    { text: "comcast xfinity high speed internet", category: "Utilities" },
    { text: "spectrum online digital cable web", category: "Utilities" },
    { text: "municipal sewer and water district", category: "Utilities" },
    { text: "municipal electric power grid utility", category: "Utilities" },
    { text: "att wireless mobile phone bill", category: "Utilities" },
    { text: "verizon mobile cellular talk plan", category: "Utilities" },
    { text: "t-mobile prepay phone telecom services", category: "Utilities" },
    { text: "waste management trash garbage collection", category: "Utilities" },
    { text: "energy electricity light power bill", category: "Utilities" },
    { text: "gas company heating utility winter charge", category: "Utilities" },
    { text: "utilities monthly apartment maintenance water", category: "Utilities" },
    { text: "centurylink broadband wifi internet", category: "Utilities" },
    { text: "cox communications telecom services", category: "Utilities" },

    // Entertainment
    { text: "netflix monthly streaming video premium", category: "Entertainment" },
    { text: "spotify music family plans soundtrack stream", category: "Entertainment" },
    { text: "disney plus marvel star wars movie stream", category: "Entertainment" },
    { text: "hbo max discovery subscription streaming", category: "Entertainment" },
    { text: "steam games wallet purchase valve software", category: "Entertainment" },
    { text: "epic games fortnite skins purchase", category: "Entertainment" },
    { text: "nintendo eshop switch game download digital", category: "Entertainment" },
    { text: "amc theaters movie ticket popcorn cinema", category: "Entertainment" },
    { text: "ticketmaster concert ticket live music show", category: "Entertainment" },
    { text: "regal cinemas movie theater ticket", category: "Entertainment" },
    { text: "playstation psn network gaming renewal", category: "Entertainment" },
    { text: "xbox live gold pass microsoft multiplayer", category: "Entertainment" },
    { text: "local pub beer pints drinks bar lounge", category: "Entertainment" },
    { text: "karaoke singing party drinks nightclub", category: "Entertainment" },
    { text: "bowling alley shoes rental bowling ball", category: "Entertainment" },
    { text: "sporting event stadium stadium ticket sports game", category: "Entertainment" },

    // Income
    { text: "payroll direct deposit salary payment", category: "Income" },
    { text: "paycheck biweekly compensation deposit", category: "Income" },
    { text: "stripe payout merchant transfer e-commerce", category: "Income" },
    { text: "freelance design contract payout consulting", category: "Income" },
    { text: "weekly salary business income direct bank deposit", category: "Income" },
    { text: "dividend payment investments portfolio cash", category: "Income" },
    { text: "upwork freelance contract funds withdrawal", category: "Income" },
    { text: "fiverr workspace order payment profit", category: "Income" },
    { text: "venmo cashout payout cash transfer earnings", category: "Income" },
    { text: "google adsense publisher advertising payout", category: "Income" },
    { text: "facebook marketplace sale cash collected items", category: "Income" },
    { text: "refund return credit merchant reversal balance", category: "Income" },
    { text: "airbnb host payout accommodation earnings", category: "Income" },
    { text: "bonus check performance reward division payout", category: "Income" },

    // Dining Out
    { text: "starbucks coffee latte food breakfast cafe", category: "Dining Out" },
    { text: "mcdonalds burger fast food drive thru", category: "Dining Out" },
    { text: "subway sandwich shop order dining lunch", category: "Dining Out" },
    { text: "uber eats online restaurant food delivery", category: "Dining Out" },
    { text: "doordash meal delivery restaurant order", category: "Dining Out" },
    { text: "chipotle Mexican grill burrito bowl guacamole", category: "Dining Out" },
    { text: "dunkin donuts cafe bagels breakfast coffee", category: "Dining Out" },
    { text: "pizzeria restaurant dinner slices pasta cheese", category: "Dining Out" },
    { text: "local diner breakfast eggs bacon brunch coffee", category: "Dining Out" },
    { text: "ramen bar noodles noodle bowl soup dining out", category: "Dining Out" },
    { text: "sushi bar sashimi green tea dining roll lunch", category: "Dining Out" },
    { text: "steakhouse elegant dinner prime rib wine grill", category: "Dining Out" },
    { text: "taco bell drive thru fast food quesadilla", category: "Dining Out" },
    { text: "bakery croissant bread pastry coffee bakery", category: "Dining Out" },

    // Transport
    { text: "uber ride trip shared trip private transit", category: "Transport" },
    { text: "lyft ride share ride taxi airport trip", category: "Transport" },
    { text: "chevron gas station regular fuel fillup", category: "Transport" },
    { text: "shell oil gasoline fill up station terminal", category: "Transport" },
    { text: "exxonmobil petroleum gas diesel pumps", category: "Transport" },
    { text: "metrocard weekly subway ticket transit fare", category: "Transport" },
    { text: "amtrak railroad train ticket commute travel", category: "Transport" },
    { text: "parking garage fee municipal parking meter", category: "Transport" },
    { text: "ezpass toll lane road car transit billing", category: "Transport" },
    { text: "delta air lines ticket booking vacation flight", category: "Transport" },
    { text: "expedia booking flights tickets hotels transit", category: "Transport" },
    { text: "car rental vehicle rental auto lease drive", category: "Transport" },
    { text: "car wash deluxe sparkling wash vehicle care", category: "Transport" },
    { text: "public transit train transit bus commute card", category: "Transport" },

    // Shopping
    { text: "amazon.com marketplace order prime package delivery", category: "Shopping" },
    { text: "ebay auction seller transaction shopping box", category: "Shopping" },
    { text: "zara clothing outerwear apparel dressing fashion", category: "Shopping" },
    { text: "h&m fast fashion clothes shirt pants dress", category: "Shopping" },
    { text: "nike sports shoe sneakers running gear apparel", category: "Shopping" },
    { text: "sephora makeup beauty cosmetics facial products", category: "Shopping" },
    { text: "best buy electronics tv computer electronics device", category: "Shopping" },
    { text: "nordstrom rack clothing retail apparel style", category: "Shopping" },
    { text: "ikea home furniture table chairs setup bookshelf", category: "Shopping" },
    { text: "home depot hardware tools construction garden", category: "Shopping" },
    { text: "furniture accessories cushion lamp decor", category: "Shopping" },
    { text: "target store retail toys bedding mug electronics", category: "Shopping" },
    { text: "walmart supercenter toys games apparel shopping item", category: "Shopping" }
  ];

  // Frequency structures
  private categoryCounts: Record<string, number> = {}; // Total documents/sequences per category
  private wordFrequencies: Record<string, Record<string, number>> = {}; // Category -> Word -> Count
  private vocab: Set<string> = new Set();
  private totalDocuments: number = 0;

  constructor() {
    this.loadAndTrain();
  }

  // Tokenize descriptions into cleaned lowercase lists of words
  public tokenize(text: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      // Strip numbers, punctuation, keep core alphabetic characters
      .replace(/[^a-z\s.\-]/g, "")
      .split(/[\s.\-_]+/)
      .map(word => word.trim())
      .filter(word => word.length > 2); // filter out short stop words like "at", "to", "my" etc.
  }

  // Train on a new description and label
  public train(text: string, category: string, saveToDisk = true): void {
    const tokens = this.tokenize(text);
    if (tokens.length === 0 || !category) return;

    // Standardize category name
    const standardizedCategory = this.standardizeCategoryName(category);

    // Initializers
    if (!this.categoryCounts[standardizedCategory]) {
      this.categoryCounts[standardizedCategory] = 0;
    }
    if (!this.wordFrequencies[standardizedCategory]) {
      this.wordFrequencies[standardizedCategory] = {};
    }

    this.categoryCounts[standardizedCategory] += 1;
    this.totalDocuments += 1;

    tokens.forEach(word => {
      this.vocab.add(word);
      this.wordFrequencies[standardizedCategory][word] = (this.wordFrequencies[standardizedCategory][word] || 0) + 1;
    });

    if (saveToDisk) {
      this.saveDynamicUserTrainData(text, standardizedCategory);
    }
  }

  // Matches budget titles to our standardize tier-1 categories 
  private standardizeCategoryName(name: string): string {
    const clean = name.toLowerCase().trim();
    if (clean.includes("groc") || clean.includes("food") || clean.includes("superm") || clean.includes("eat")) {
      if (clean.includes("eat") || clean.includes("dine") || clean.includes("restau") || clean.includes("cafe") || clean.includes("starb")) {
        return "Dining Out";
      }
      return "Groceries";
    }
    if (clean.includes("util") || clean.includes("electric") || clean.includes("power") || clean.includes("water") || clean.includes("bill") || clean.includes("wifi") || clean.includes("net") || clean.includes("cell")) {
      return "Utilities";
    }
    if (clean.includes("fun") || clean.includes("ent") || clean.includes("stream") || clean.includes("play") || clean.includes("game") || clean.includes("movie") || clean.includes("netflix") || clean.includes("bar")) {
      return "Entertainment";
    }
    if (clean.includes("incom") || clean.includes("earn") || clean.includes("pay") || clean.includes("sal") || clean.includes("stripe") || clean.includes("profit") || clean.includes("job")) {
      return "Income";
    }
    if (clean.includes("dine") || clean.includes("rest") || clean.includes("cafe") || clean.includes("starbucks") || clean.includes("coffee") || clean.includes("food") || clean.includes("lunch")) {
      return "Dining Out";
    }
    if (clean.includes("trans") || clean.includes("gas") || clean.includes("shell") || clean.includes("travel") || clean.includes("uber") || clean.includes("lyft") || clean.includes("car") || clean.includes("flight")) {
      return "Transport";
    }
    if (clean.includes("shop") || clean.includes("buy") || clean.includes("buy") || clean.includes("amazon") || clean.includes("clothes") || clean.includes("zara") || clean.includes("lifestyle") || clean.includes("spend")) {
      return "Shopping";
    }
    
    // Capitalize first letter of whatever was given to elegantly match user's custom category
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Predict function returning probabilities for each class
  public classify(text: string): PredictionResult {
    const tokens = this.tokenize(text);
    const categories = Object.keys(this.categoryCounts);

    if (tokens.length === 0 || categories.length === 0) {
      return {
        category: "Shopping", // Default fallback
        confidence: 0.50,
        allProbabilities: categories.map(cat => ({ category: cat, probability: 1 / categories.length }))
      };
    }

    const scores: Record<string, number> = {};
    const smoothingAlpha = 0.8; // Laplace smoothing hyperparameter
    const vocabSize = this.vocab.size || 100;

    categories.forEach(category => {
      // Prior probability score log(P(c))
      const priorProb = this.categoryCounts[category] / this.totalDocuments;
      let logProbability = Math.log(priorProb || 0.01);

      // Compute total words in current category class
      const totalWordsInMemory = Object.values(this.wordFrequencies[category]).reduce((a, b) => a + b, 0);

      // Likelihood value log(P(w|c)) for current tokens list
      tokens.forEach(word => {
        const count = this.wordFrequencies[category][word] || 0;
        // Laplace smoothing calculations
        const likelihood = (count + smoothingAlpha) / (totalWordsInMemory + smoothingAlpha * vocabSize);
        logProbability += Math.log(likelihood);
      });

      scores[category] = logProbability;
    });

    // Translate negative log probability exponents into human-friendly percentages/weights
    const maxLogScore = Math.max(...Object.values(scores));
    const probabilityExponents = Object.keys(scores).map(category => {
      // Offset values to prevent extreme math overflow
      const exponent = Math.exp(scores[category] - maxLogScore);
      return { category, score: exponent };
    });

    const sumExp = probabilityExponents.reduce((sum, item) => sum + item.score, 0);
    const allProbabilities = probabilityExponents
      .map(item => ({
        category: item.category,
        probability: Number((item.score / (sumExp || 1)).toFixed(3))
      }))
      .sort((a, b) => b.probability - a.probability);

    const topResult = allProbabilities[0];

    return {
      category: topResult?.category || "Shopping",
      confidence: topResult?.probability || 0.50,
      allProbabilities
    };
  }

  // Load static baseline data and merge active user dynamics
  private loadAndTrain(): void {
    // 1. Core baseline data training
    this.initialDataset.forEach(sample => {
      this.train(sample.text, sample.category, false);
    });

    // 2. Read dynamic modifications saved locally
    try {
      const stored = localStorage.getItem("budjet_dynamic_ml_data");
      if (stored) {
        const list: { text: string; category: string }[] = JSON.parse(stored);
        list.forEach(item => {
          this.train(item.text, item.category, false);
        });
        console.log(`ML pipeline successfully loaded & trained on ${list.length} dynamic user inputs!`);
      }
    } catch (e) {
      console.warn("Unable to restore dynamic user model offsets:", e);
    }
  }

  // Save dynamically as user commits changes to their real-time ledger
  private saveDynamicUserTrainData(text: string, category: string): void {
    try {
      const stored = localStorage.getItem("budjet_dynamic_ml_data");
      const list: { text: string; category: string }[] = stored ? JSON.parse(stored) : [];
      list.push({ text, category });
      
      // Bound the memory buffer to last 200 inputs to keep storage small and swift
      if (list.length > 200) list.shift();

      localStorage.setItem("budjet_dynamic_ml_data", JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save dynamic user training context:", e);
    }
  }
}

// Export Singleton classifier object
export const transactionClassifier = new NaiveBayesClassifier();
