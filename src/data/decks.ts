import type { DiagramSpec } from './lessons';
import type { MisconceptionId } from './questions';
import type { SkillId } from './skills';

export type DeckLang = 'en' | 'fil' | 'taglish';

export type Trilingual = {
  en: string;
  fil: string;
  taglish: string;
};

export type InterestTag = 'mobile_legends' | 'jeepney' | 'basketball' | 'cooking' | 'creator';

export const INTEREST_LABELS: Record<InterestTag, Trilingual> = {
  mobile_legends: { en: 'Mobile Legends', fil: 'Mobile Legends', taglish: 'Mobile Legends' },
  jeepney: { en: 'Jeepney Commute', fil: 'Pamasahe sa Jeep', taglish: 'Jeepney Ride' },
  basketball: { en: 'PBA & Hoops', fil: 'Basketball', taglish: 'PBA Hoops' },
  cooking: { en: 'Lutong Bahay', fil: 'Pagluluto', taglish: 'Lutong Bahay' },
  creator: { en: 'Short Clips', fil: 'Maikling Video', taglish: 'Video Creator' },
};

export type DeckMisconceptionId = MisconceptionId | 'additive_reasoning' | 'wrong_operation' | 'inverted_ratio';

export type DeckChoice = {
  text: string;
  correct?: boolean;
  misconception_id?: DeckMisconceptionId;
  misconception_label?: Trilingual;
};

export type MicroDeck = {
  schema_version: 2;
  card_id: string;
  skill_id: SkillId;
  curriculum_ref: {
    framework: string;
    competency_text: string;
  };
  interest_tag: InterestTag;
  arousal_level: 'low' | 'medium';
  est_seconds: number;
  hook: Trilingual;
  lesson: {
    format: 'step_cards' | 'contrast_card' | 'flashcard';
    steps: Trilingual[];
    diagram: DiagramSpec;
    contrast?: {
      wrongLabel: Trilingual;
      rightLabel: Trilingual;
      note: Trilingual;
    };
  };
  check: {
    type: 'mcq';
    prompt: Trilingual;
    choices: DeckChoice[];
    explanation: Trilingual;
    question_id: string;
  };
  provenance: {
    generator: string;
    solver_verified: boolean;
    teacher_status: 'approved';
    source_ref: string;
  };
};

export type DecelerationKind = 'trivia' | 'science' | 'puzzle' | 'tomorrow' | 'end';

export type DecelerationCard = {
  id: string;
  kind: DecelerationKind;
  eyebrow: Trilingual;
  title: Trilingual;
  body: Trilingual;
  /** Optional calm prompt choices (used by puzzle / set up tomorrow cards). */
  options?: Trilingual[];
  /** Hint line on puzzle card. */
  note?: Trilingual;
};

export function pickText(text: Trilingual, lang: DeckLang): string {
  return text[lang];
}

export const MICRO_DECKS: MicroDeck[] = [
  {
    schema_version: 2,
    card_id: 'g7_prop_mlbb_gold_0003',
    skill_id: 'ratio',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Solves problems involving direct proportion and constant unit rates.',
    },
    interest_tag: 'mobile_legends',
    arousal_level: 'medium',
    est_seconds: 35,
    hook: {
      en: 'Your hero earned 360 gold in 4 minutes. Same farm rate: can you afford a 900-gold item by minute 10?',
      fil: 'Kumita ang hero mo ng 360 gold sa 4 na minuto. Kung pareho ang bilis, may 900 gold ka na ba sa minuto 10?',
      taglish: 'Kumita ang hero mo ng 360 gold in 4 minutes. Same farm rate: kaya na ba ang 900-gold item by minute 10?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'ratio', a: 1, b: 2 },
      steps: [
        {
          en: 'Find the rate per minute first: 360 gold ÷ 4 min = 90 gold each minute.',
          fil: 'Hanapin muna ang kita bawat minuto: 360 gold ÷ 4 min = 90 gold kada minuto.',
          taglish: 'Hanapin muna ang unit rate: 360 gold ÷ 4 min = 90 gold per minute.',
        },
        {
          en: 'Keep that same rate and multiply by the new time: 90 × 10 = 900 gold.',
          fil: 'Panatilihin ang rate at i-multiply sa bagong oras: 90 × 10 = 900 gold.',
          taglish: 'Same rate, kaya i-multiply sa new time: 90 × 10 = 900 gold.',
        },
      ],
      contrast: {
        wrongLabel: {
          en: 'Jeepney fare: ₱13 base (first 4 km) + ₱1.80/km',
          fil: 'Pamasahe sa jeep: ₱13 (unang 4 km) + ₱1.80/km',
          taglish: 'Bakit hindi proportional ang pamasahe sa jeep? May ₱13 base fare!',
        },
        rightLabel: {
          en: 'MLBB farm rate: 0 gold at 0 min, +90 every min',
          fil: 'Kita ng gold: 0 sa 0 min, +90 bawat minuto',
          taglish: 'Sa MLBB rate: 0 sa start, kaya double time = double gold.',
        },
        note: {
          en: 'A jeepney has a ₱13 starting fare, so doubling distance does not double the fare. Constant rate starts at 0.',
          fil: 'May panimulang ₱13 ang jeep, kaya kapag nadoble ang layo, hindi doble ang bayad.',
          taglish: 'May base fare na ₱13 ang jeep, kaya di nagdo-double pag dinoble ang km — unlike constant rate!',
        },
      },
    },
    check: {
      type: 'mcq',
      question_id: 'rat-2',
      prompt: {
        en: 'Hero earns 360 gold in 4 min. Same rate: how much gold in 10 min?',
        fil: 'Nakakuha ng 360 gold sa 4 min. Magkano sa 10 min kung pareho ang rate?',
        taglish: 'Hero earns 360 gold in 4 min. Same rate: magkano sa 10 min?',
      },
      choices: [
        {
          text: '366',
          misconception_id: 'additive_reasoning',
          misconception_label: {
            en: 'Additive reasoning (+6 min added as +6 gold)',
            fil: 'Pagdaragdag lang (+6 min ay idinagdag lang sa 360)',
            taglish: 'Additive reasoning: dinagdag mo lang ang +6 sa 360 imbes na i-scale ang rate.',
          },
        },
        {
          text: '900',
          correct: true,
        },
        {
          text: '3,600',
          misconception_id: 'wrong_operation',
          misconception_label: {
            en: 'Multiplied 360 × 10 without dividing by 4',
            fil: 'Nag-multiply ng 360 × 10 nang hindi hinati sa 4',
            taglish: 'Wrong operation: na-multiply ang 360 × 10 without dividing by 4 first.',
          },
        },
        {
          text: '144',
          misconception_id: 'inverted_ratio',
          misconception_label: {
            en: 'Inverted the time ratio (4 ÷ 10 instead of 10 ÷ 4)',
            fil: 'Binaliktad ang ratio ng oras (4 ÷ 10 imbes na 10 ÷ 4)',
            taglish: 'Inverted ratio: na-multiply sa 4/10 imbes na 10/4.',
          },
        },
      ],
      explanation: {
        en: '900 is right! Proportional means the unit rate stays steady: 90 gold per minute × 10 minutes.',
        fil: 'Tama ang 900! Kapag proportional, pare-pareho ang rate: 90 gold bawat minuto × 10 minuto.',
        taglish: 'Tama ang 900! Kapag proportional, steady ang rate: 90 gold per min × 10 min.',
      },
    },
    provenance: {
      generator: 'template:prop_rate_v1#variant=3',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 12',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_frac_pizza_share_0001',
    skill_id: 'fractions',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Adds dissimilar fractions by finding equivalent fractions with a common denominator.',
    },
    interest_tag: 'cooking',
    arousal_level: 'medium',
    est_seconds: 35,
    hook: {
      en: 'You ate 1/2 of a bibingka and your cousin ate 1/3. How much of the whole bibingka is gone?',
      fil: 'Kumain ka ng 1/2 ng bibingka at 1/3 naman ang pinsan mo. Gaano kalaki ang naubos?',
      taglish: 'Kumain ka ng 1/2 ng bibingka at 1/3 naman si pinsan. Ilan lahat ang nakain?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'sum', parts: 6, a: 3, b: 2, label: '5/6' },
      steps: [
        {
          en: 'Cut both shares into equal sixths so the slices match: 1/2 = 3/6 and 1/3 = 2/6.',
          fil: 'Gawing magkasing-laking sixths ang hiwa: 1/2 = 3/6 at 1/3 = 2/6.',
          taglish: 'Match the slice sizes first: 1/2 = 3/6 at 1/3 = 2/6.',
        },
        {
          en: 'Add only the top counts (numerators) and keep the slice size: 3/6 + 2/6 = 5/6.',
          fil: 'Pagsamahin lang ang itaas at panatilihin ang ibaba: 3/6 + 2/6 = 5/6.',
          taglish: 'Add the tops, keep the bottom: 3/6 + 2/6 = 5/6.',
        },
      ],
      contrast: {
        wrongLabel: {
          en: 'Common slip: 1/2 + 1/3 → (1+1)/(2+3) = 2/5',
          fil: 'Karaniwang mali: pinag-add ang itaas at ibaba = 2/5',
          taglish: 'Common slip: 1/2 + 1/3 ≠ 2/5 (2/5 is even smaller than 1/2!)',
        },
        rightLabel: {
          en: 'Matching slices: 3/6 + 2/6 = 5/6',
          fil: 'Magkaparehong hiwa: 3/6 + 2/6 = 5/6',
          taglish: 'Equal slices: 3/6 + 2/6 = 5/6 (almost the whole bibingka!)',
        },
        note: {
          en: '2/5 is less than half! Whenever the slices differ, convert bottoms before adding.',
          fil: 'Mas maliit pa sa kalahati ang 2/5! Pantayin muna ang hiwa bago mag-add.',
          taglish: 'Mas maliit sa kalahati ang 2/5 — kaya always check kung makes sense ang sagot.',
        },
      },
    },
    check: {
      type: 'mcq',
      question_id: 'fra-1',
      prompt: {
        en: 'What is 1/2 + 1/3?',
        fil: 'Ano ang 1/2 + 1/3?',
        taglish: 'Magkano ang 1/2 + 1/3?',
      },
      choices: [
        {
          text: '2/5',
          misconception_id: 'frac-add-across',
          misconception_label: {
            en: 'Added tops and bottoms straight across',
            fil: 'Pinag-add pati ang mga denominator sa ibaba',
            taglish: 'Frac-add-across: na-add mo pati yung denominators (2 + 3 = 5).',
          },
        },
        { text: '5/6', correct: true },
        {
          text: '1/6',
          misconception_id: 'unknown',
          misconception_label: {
            en: 'Subtracted instead of adding slices',
            fil: 'Nagbawas sa halip na magdagdag',
            taglish: 'Na-subtract yung slices imbes na pinagsama.',
          },
        },
        {
          text: '2/6',
          misconception_id: 'frac-no-common',
          misconception_label: {
            en: 'Added numerators after changing only the denominator',
            fil: 'Nagpalit ng denominator pero hindi binago ang itaas',
            taglish: 'Nag-common denominator ng 6, pero di na-scale yung numerators.',
          },
        },
      ],
      explanation: {
        en: '5/6! Converting to 3/6 + 2/6 gives equal slices, leaving just 1/6 of the bibingka.',
        fil: '5/6! Kapag naging 3/6 + 2/6, pantay na ang hiwa at 1/6 na lang ang natira.',
        taglish: '5/6! Pag ginawang 3/6 + 2/6, pantay ang hiwa — 1/6 na lang ang tira!',
      },
    },
    provenance: {
      generator: 'template:frac_add_v2#variant=1',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 4',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_alg_mango_terms_0002',
    skill_id: 'algebraic',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Simplifies algebraic expressions by combining only like terms.',
    },
    interest_tag: 'cooking',
    arousal_level: 'medium',
    est_seconds: 30,
    hook: {
      en: 'You packed 3 bags of x mangoes plus 2 loose pesos on the counter. Can you call that 5x?',
      fil: 'May 3 supot ka ng x na mangga at 2 baryang piso sa mesa. Puwede bang gawing 5x iyon?',
      taglish: 'May 3 bags ka of x mangoes plus 2 pesos on the table. Pwede bang sabihing 5x yun?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'tiles', x: 3, ones: 2 },
      steps: [
        {
          en: 'Terms with x (mango bags) and plain numbers (pesos) are unlike terms.',
          fil: 'Magkaiba ang may x (supot ng mangga) at ang numerong walang x (piso).',
          taglish: 'Magkaiba ang x-tiles at plain numbers — hindi sila pwedeng i-merge.',
        },
        {
          en: 'Combine only matching kinds: 3x + 2 stays 3x + 2.',
          fil: 'Ang magkatulad lang ang nagsasama: mananatiling 3x + 2.',
          taglish: 'Only combine like terms: 3x + 2 stays 3x + 2.',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'alg-2',
      prompt: {
        en: 'Simplify 3x + 2',
        fil: 'Pasimplehin ang 3x + 2',
        taglish: 'Simplify: 3x + 2',
      },
      choices: [
        {
          text: '5x',
          misconception_id: 'alg-unlike',
          misconception_label: {
            en: 'Combined an x term with a plain constant',
            fil: 'Pinagsama ang may x at ang numerong walang x',
            taglish: 'Unlike terms: pinagsama yung 3x at 2 kahit walang x yung 2.',
          },
        },
        { text: '3x + 2', correct: true },
        {
          text: '5',
          misconception_id: 'alg-unlike',
          misconception_label: {
            en: 'Dropped the variable x completely',
            fil: 'Nawala ang letrang x nang magdagdag',
            taglish: 'Nawala yung x variable when adding 3 + 2.',
          },
        },
        {
          text: '6x',
          misconception_id: 'wrong_operation',
          misconception_label: {
            en: 'Multiplied 3x and 2 instead of keeping +',
            fil: 'Nag-multiply imbes na panatilihin ang plus',
            taglish: 'Na-multiply mo yung 3 × 2 instead of leaving + 2.',
          },
        },
      ],
      explanation: {
        en: '3x + 2 is already simplest! Like terms need the exact same variable.',
        fil: '3x + 2 na ang pinakasimpleng anyo! Magkaparehong variable lang ang puwedeng pagsamahin.',
        taglish: '3x + 2 is already simplified! Same variable lang pwedeng i-combine.',
      },
    },
    provenance: {
      generator: 'template:alg_like_terms_v1#variant=2',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 19',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_int_elevator_0001',
    skill_id: 'integers',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Performs addition and subtraction on integers using number-line reasoning.',
    },
    interest_tag: 'jeepney',
    arousal_level: 'medium',
    est_seconds: 30,
    hook: {
      en: 'Your load balance was ₱5, and a ₱2 promo penalty got refunded (−(−2)). What is your balance now?',
      fil: 'May ₱5 load ka at ibinalik ang ₱2 kaltas (−(−2)). Magkano na ang load mo?',
      taglish: 'May ₱5 load ka at na-refund ang ₱2 kaltas (−(−2)). Magkano na load mo now?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'numberline', from: 0, to: 8, start: 5, jump: 2 },
      steps: [
        {
          en: 'Subtracting a negative takes away a deduction — which moves right on the number line.',
          fil: 'Ang pagbawas ng negative ay pag-alis ng utang — kaya pakanan ito.',
          taglish: 'Taking away a negative (−(−2)) flips to +2.',
        },
        {
          en: 'Start at 5 and step 2 right: 5 − (−2) = 5 + 2 = 7.',
          fil: 'Magsimula sa 5 at humakbang ng 2 pakanan: 5 − (−2) = 5 + 2 = 7.',
          taglish: 'Start at 5, hop 2 right: 5 + 2 = 7.',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'int-2',
      prompt: {
        en: 'Compute 5 − (−2)',
        fil: 'Kuwentahin ang 5 − (−2)',
        taglish: 'What is 5 − (−2)?',
      },
      choices: [
        { text: '7', correct: true },
        {
          text: '3',
          misconception_id: 'int-sign',
          misconception_label: {
            en: 'Treated − (−2) as subtracting 2',
            fil: 'Nagbawas ng 2 imbes na magdagdag',
            taglish: 'Sign error: na-treat yung −(−2) as regular minus 2.',
          },
        },
        {
          text: '−7',
          misconception_id: 'int-sign',
          misconception_label: {
            en: 'Flipped the final sign to negative',
            fil: 'Ginawang negative ang huling sagot',
            taglish: 'Sign flip: naging negative yung sagot.',
          },
        },
        {
          text: '−3',
          misconception_id: 'int-sign',
          misconception_label: {
            en: 'Subtracted 5 from 2 with wrong sign',
            fil: 'Nagbawas ng 5 sa 2 nang may maling sign',
            taglish: 'Sign confusion between 5 and −2.',
          },
        },
      ],
      explanation: {
        en: '7 is right! Removing a negative (−2) is the same as adding +2.',
        fil: '7 ang tama! Ang pag-alis ng negative (−2) ay katulad ng pagdagdag ng +2.',
        taglish: '7 is correct! Pag tinanggal ang utang na −2, nagiging +2.',
      },
    },
    provenance: {
      generator: 'template:int_sub_v1#variant=2',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 9',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_lin_balance_0003',
    skill_id: 'linear',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Solves one-variable linear equations by applying inverse operations to both sides.',
    },
    interest_tag: 'basketball',
    arousal_level: 'medium',
    est_seconds: 35,
    hook: {
      en: 'Your squad’s total score split evenly across 3 quarters is 4 points per quarter (x/3 = 4). Total score?',
      fil: 'Ang kabuuang puntos ninyo na hinati sa 3 quarter ay 4 na puntos bawat quarter (x/3 = 4). Ilan lahat?',
      taglish: 'Total score ninyo divided by 3 quarters is 4 pts each (x/3 = 4). Ano ang x?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'balance', left: 'x/3', right: '4' },
      steps: [
        {
          en: 'An equation is a balance scale: keep both sides equal.',
          fil: 'Timbangan ang equation: laging pantay ang magkabilang panig.',
          taglish: 'Think of = as a balance scale: do the same to both sides.',
        },
        {
          en: 'Undo ÷ 3 by multiplying both sides by 3: x = 4 × 3 = 12.',
          fil: 'I-undo ang ÷ 3 gamit ang × 3 sa magkabila: x = 4 × 3 = 12.',
          taglish: 'Undo ÷ 3 with × 3 on both sides: x = 4 × 3 = 12.',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'lin-3',
      prompt: {
        en: 'If x/3 = 4, what is x?',
        fil: 'Kung x/3 = 4, ano ang x?',
        taglish: 'Kung x/3 = 4, what is x?',
      },
      choices: [
        { text: '12', correct: true },
        {
          text: '4/3',
          misconception_id: 'lin-frac-coef',
          misconception_label: {
            en: 'Divided by 3 instead of multiplying by 3',
            fil: 'Naghati sa 3 imbes na mag-multiply sa 3',
            taglish: 'Lin-frac-coef: na-divide ulit by 3 instead of multiplying by 3.',
          },
        },
        {
          text: '1',
          misconception_id: 'unknown',
          misconception_label: {
            en: 'Subtracted 3 from 4',
            fil: 'Ibinawas ang 3 sa 4',
            taglish: 'Na-subtract yung 4 − 3 instead of using ×.',
          },
        },
        {
          text: '7',
          misconception_id: 'lin-move-sign',
          misconception_label: {
            en: 'Added 3 + 4 instead of multiplying',
            fil: 'Pinag-add ang 3 + 4 sa halip na i-multiply',
            taglish: 'Lin-move-sign: ginawang +3 ang ÷3 paglipat sa kabila.',
          },
        },
      ],
      explanation: {
        en: '12! Check it back: 12 ÷ 3 = 4.',
        fil: '12! I-check natin: 12 ÷ 3 = 4.',
        taglish: '12! Check: 12 ÷ 3 = 4, balanced!',
      },
    },
    provenance: {
      generator: 'template:lin_inv_v1#variant=1',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 25',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_dec_snack_0001',
    skill_id: 'decimals',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Multiplies decimals and places the decimal point using total decimal digits.',
    },
    interest_tag: 'cooking',
    arousal_level: 'low',
    est_seconds: 30,
    hook: {
      en: '1.2 liters of mango juice at 0.3 concentration. Is the pure juice 3.6 or 0.36 liters?',
      fil: '1.2 litrong mango juice na may 0.3 konsentrasyon. 3.6 o 0.36 litro ba ang purong katas?',
      taglish: '1.2 L mango juice × 0.3 concentration — 3.6 ba or 0.36 L?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'grid', w: 4, h: 3 },
      steps: [
        {
          en: 'Multiply the whole digits first: 12 × 3 = 36.',
          fil: 'I-multiply muna ang mga numero: 12 × 3 = 36.',
          taglish: 'Multiply without dots first: 12 × 3 = 36.',
        },
        {
          en: 'Count total decimal digits (1 in 1.2 + 1 in 0.3 = 2 places) → 0.36.',
          fil: 'Bilangin ang decimal places (1 sa 1.2 + 1 sa 0.3 = 2) → 0.36.',
          taglish: 'Count 2 decimal places total (1 + 1) → 0.36.',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'dec-3',
      prompt: {
        en: '1.2 × 0.3 = ?',
        fil: '1.2 × 0.3 = ?',
        taglish: '1.2 × 0.3 = ?',
      },
      choices: [
        { text: '0.36', correct: true },
        {
          text: '3.6',
          misconception_id: 'dec-place',
          misconception_label: {
            en: 'Counted only 1 decimal place instead of 2',
            fil: '1 decimal place lang ang nabilang imbes na 2',
            taglish: 'Decimal place slip: 1 decimal place lang ang nabilang imbes na 2.',
          },
        },
        {
          text: '0.036',
          misconception_id: 'dec-place',
          misconception_label: {
            en: 'Shifted 3 decimal places instead of 2',
            fil: 'Sumobra sa 3 decimal places',
            taglish: 'Sobra ng isang shift: naging 3 decimal places.',
          },
        },
        {
          text: '36',
          misconception_id: 'dec-place',
          misconception_label: {
            en: 'Forgot to place the decimal point back',
            fil: 'Nakalimutang ibalik ang decimal point',
            taglish: 'Nakalimutang ibalik ang decimal point.',
          },
        },
      ],
      explanation: {
        en: '0.36! Taking 0.3 of 1.2 makes it smaller than 1.2, so 3.6 cannot be right.',
        fil: '0.36! Mas maliit sa 1 ang 0.3, kaya dapat lumiit mula 1.2.',
        taglish: '0.36! Multiplying by 0.3 shrinks 1.2, kaya 0.36 ang tama.',
      },
    },
    provenance: {
      generator: 'template:dec_mult_v1#variant=1',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 15',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_geo_garden_0001',
    skill_id: 'geometry',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Distinguishes perimeter from area in rectangles and squares.',
    },
    interest_tag: 'creator',
    arousal_level: 'low',
    est_seconds: 30,
    hook: {
      en: 'You frame a 5 cm × 5 cm square photo sticker. Need ribbon around the edge — 20 cm or 25 cm?',
      fil: 'Lalagyan ng laso ang palibot ng 5 cm × 5 cm na sticker. 20 cm o 25 cm ang kailangan?',
      taglish: 'Maglalagay ka ng border around a 5 cm × 5 cm square sticker — 20 cm or 25 cm?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'grid', w: 5, h: 5 },
      steps: [
        {
          en: 'Perimeter walks the outside edge: 5 + 5 + 5 + 5 = 20 cm.',
          fil: 'Binabaybay ng perimeter ang 4 na gilid: 5 + 5 + 5 + 5 = 20 cm.',
          taglish: 'Perimeter = palibot ng edge: 4 × 5 = 20 cm.',
        },
        {
          en: 'Area counts the squares inside: 5 × 5 = 25 cm².',
          fil: 'Binibilang ng area ang loob: 5 × 5 = 25 cm².',
          taglish: 'Area = laman sa loob: 5 × 5 = 25 cm².',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'geo-1',
      prompt: {
        en: 'Square with side 5 cm. What is its perimeter?',
        fil: 'Parisukat na may gilid na 5 cm. Ano ang perimeter?',
        taglish: 'Square with side 5 cm — ano ang perimeter?',
      },
      choices: [
        { text: '20 cm', correct: true },
        {
          text: '25 cm',
          misconception_id: 'geo-area-perimeter',
          misconception_label: {
            en: 'Calculated area (5 × 5) instead of perimeter',
            fil: 'Area (5 × 5) ang nakuha imbes na perimeter',
            taglish: 'Area vs Perimeter: 5 × 5 is area, hindi perimeter around the edge.',
          },
        },
        {
          text: '10 cm',
          misconception_id: 'unknown',
          misconception_label: {
            en: 'Added only two sides instead of all four',
            fil: 'Dalawang gilid lang ang pinagsama',
            taglish: 'Two sides lang ang na-add (5 + 5), kulang ng 2 sides.',
          },
        },
        {
          text: '5 cm',
          misconception_id: 'unknown',
          misconception_label: {
            en: 'Kept only one side length',
            fil: 'Isang gilid lang ang isinagot',
            taglish: 'Isang side lang ang naisulat.',
          },
        },
      ],
      explanation: {
        en: '20 cm! Perimeter adds all 4 sides around the outside.',
        fil: '20 cm! Pinagsasama ng perimeter ang lahat ng 4 na gilid sa labas.',
        taglish: '20 cm! Perimeter adds all 4 sides around the border.',
      },
    },
    provenance: {
      generator: 'template:geo_perim_v1#variant=1',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 28',
    },
  },
  {
    schema_version: 2,
    card_id: 'g7_stat_median_0001',
    skill_id: 'statistics',
    curriculum_ref: {
      framework: 'DepEd MATATAG, Grade 7 Mathematics',
      competency_text: 'Determines the median of an ungrouped data set by ordering values first.',
    },
    interest_tag: 'basketball',
    arousal_level: 'low',
    est_seconds: 30,
    hook: {
      en: 'Five game scores: 3, 9, 4, 7, 5. Why is the middle score 5 and NOT 4?',
      fil: 'Limang score: 3, 9, 4, 7, 5. Bakit 5 ang gitna at hindi 4?',
      taglish: '5 game scores: 3, 9, 4, 7, 5. Bakit 5 ang median at hindi 4?',
    },
    lesson: {
      format: 'step_cards',
      diagram: { kind: 'bar', parts: 5, filled: 3 },
      steps: [
        {
          en: 'Always sort the numbers from smallest to largest first: 3, 4, 5, 7, 9.',
          fil: 'Iayos muna mula pinakamababa hanggang pinakamataas: 3, 4, 5, 7, 9.',
          taglish: 'Sort muna from lowest to highest: 3, 4, 5, 7, 9.',
        },
        {
          en: 'Pick the middle value of the sorted list → 5.',
          fil: 'Kunin ang nasa gitna ng nakaayos na listahan → 5.',
          taglish: 'Pick the middle number in the sorted list → 5.',
        },
      ],
    },
    check: {
      type: 'mcq',
      question_id: 'sta-2',
      prompt: {
        en: 'Median of 3, 9, 4, 7, 5?',
        fil: 'Median ng 3, 9, 4, 7, 5?',
        taglish: 'Median ng 3, 9, 4, 7, 5?',
      },
      choices: [
        { text: '5', correct: true },
        {
          text: '4',
          misconception_id: 'stat-median-sort',
          misconception_label: {
            en: 'Picked middle number before sorting',
            fil: 'Kinuha ang gitna nang hindi muna inayos',
            taglish: 'Forgot to sort: gitna ng unsorted list ang napili.',
          },
        },
        {
          text: '7',
          misconception_id: 'unknown',
          misconception_label: {
            en: 'Picked the fourth sorted value',
            fil: 'Ikaapat na numero ang napili',
            taglish: 'Off-by-one position sa list.',
          },
        },
        {
          text: '5.6',
          misconception_id: 'stat-mean-median',
          misconception_label: {
            en: 'Computed the mean instead of the median',
            fil: 'Mean ang kinuwenta imbes na median',
            taglish: 'Mean vs Median: na-average mo instead of taking the middle.',
          },
        },
      ],
      explanation: {
        en: '5! Sorting 3, 4, 5, 7, 9 puts 5 right in the middle.',
        fil: '5! Pag naayos sa 3, 4, 5, 7, 9, nasa gitna ang 5.',
        taglish: '5! Pag naka-sort na (3, 4, 5, 7, 9), 5 ang nasa gitna.',
      },
    },
    provenance: {
      generator: 'template:stat_med_v1#variant=1',
      solver_verified: true,
      teacher_status: 'approved',
      source_ref: 'Grade 7 Math Module, p. 33',
    },
  },
];

export function pickMicroDecks(root: SkillId, limit = 5): MicroDeck[] {
  const first = MICRO_DECKS.filter((d) => d.skill_id === root);
  const rest = MICRO_DECKS.filter((d) => d.skill_id !== root);
  return [...first, ...rest].slice(0, limit);
}

/**
 * Calm, low-arousal Deceleration Deck (Blueprint v2 Section 3.3):
 * - No autoplay, no counters, no likes, no red badges.
 * - Transitions 350–450 ms instead of snappy 200 ms.
 * - Finite by design: ends on a clear Goodnight / close-app card.
 */
export const DECELERATION_DECK: DecelerationCard[] = [
  {
    id: 'dec-trivia',
    kind: 'trivia',
    eyebrow: { en: 'Quiet trivia', fil: 'Tahimik na trivia', taglish: 'Quiet trivia' },
    title: {
      en: 'A Philippine tarsier’s eyes never move inside its sockets.',
      fil: 'Hindi umiikot sa loob ang mga mata ng tarsier ng Bohol.',
      taglish: 'Hindi umiikot ang eyes ng Philippine tarsier sa loob ng skull.',
    },
    body: {
      en: 'Each eye weighs more than its brain, so it turns its whole head almost 180° slowly to look around at night — never rushing.',
      fil: 'Mas mabigat pa ang isang mata nito kaysa utak niya, kaya dahan-dahan nitong iniikot ang ulo halos 180° sa gabi.',
      taglish: 'Kaya dahan-dahan niyang iniikot ang ulo halos 180° every night — slow and steady, walang nagmamadali.',
    },
  },
  {
    id: 'dec-science',
    kind: 'science',
    eyebrow: { en: 'Slow science', fil: 'Kalmadong agham', taglish: 'Slow science' },
    title: {
      en: 'Why rain on warm soil smells so calming',
      fil: 'Bakit nakakakalma ang amoy ng ulan sa mainit na lupa',
      taglish: 'Why rain on warm soil smells so good (petrichor)',
    },
    body: {
      en: 'Dry soil traps tiny plant oils. When the first raindrops hit, air bubbles burst up as petrichor — a scent humans evolved to link with relief and rest.',
      fil: 'May langis mula sa halaman ang tuyong lupa. Pagpatak ng ulan, sumisingaw ang petrichor — amoy ng pahinga pagkatapos ng init.',
      taglish: 'Dry soil traps plant oils. Pagpatak ng ulan, lumalabas ang petrichor scent — natural signal ng relief and rest.',
    },
  },
  {
    id: 'dec-puzzle',
    kind: 'puzzle',
    eyebrow: { en: 'Quiet visual puzzle', fil: 'Tahimik na palaisipan', taglish: 'Quiet puzzle' },
    title: {
      en: 'Tap three calm stars to trace tonight’s triangle.',
      fil: 'Pindutin ang tatlong bituin para buuin ang tatsulok ngayong gabi.',
      taglish: 'Tap 3 stars softly to trace a calm triangle.',
    },
    body: {
      en: 'No timer, no score. Just notice the shapes settle.',
      fil: 'Walang timer, walang puntos. Tingnan lang ang mga hugis.',
      taglish: 'No timer, no score. Just slow taps.',
    },
    note: {
      en: 'Night sky steady · take one slow breath',
      fil: 'Tahimik ang langit · huminga nang dahan-dahan',
      taglish: 'Calm sky · huminga nang malalim',
    },
  },
  {
    id: 'dec-tomorrow',
    kind: 'tomorrow',
    eyebrow: { en: 'Set up tomorrow', fil: 'Ihanda ang bukas', taglish: 'Set up tomorrow' },
    title: {
      en: 'Pick one easy thing for tomorrow morning.',
      fil: 'Pumili ng isang madaling gagawin bukas ng umaga.',
      taglish: 'Pick one small win for tomorrow morning.',
    },
    body: {
      en: 'Putting a single plan down lets your brain stop holding open tabs tonight.',
      fil: 'Kapag may isang malinaw na plano, mas madaling magpahinga ang isip ngayon.',
      taglish: 'Once you pick one, your brain can close the rest of the tabs tonight.',
    },
    options: [
      {
        en: 'Put uniform and bag near the door',
        fil: 'Ihanda ang bag at uniporme sa tabi ng pinto',
        taglish: 'I-ready ang bag and uniform near the door',
      },
      {
        en: 'Charge phone outside arm’s reach',
        fil: 'I-charge ang phone nang malayo sa kama',
        taglish: 'Charge phone away from the pillow',
      },
      {
        en: 'Drink water before opening any app',
        fil: 'Uminom ng tubig bago magbukas ng app',
        taglish: 'Drink water muna before checking apps',
      },
    ],
  },
  {
    id: 'dec-end',
    kind: 'end',
    eyebrow: { en: 'End of deck', fil: 'Dulo ng deck', taglish: 'End of deck' },
    title: {
      en: 'The deck ends here. Goodnight.',
      fil: 'Hanggang dito lang ang deck. Magandang gabi.',
      taglish: 'Tapos na ang deck. Goodnight.',
    },
    body: {
      en: 'LearnShift has nothing more to scroll tonight. Put the phone down and rest well.',
      fil: 'Wala nang susunod na i-scroll ngayong gabi. Ibaba na ang phone at magpahinga.',
      taglish: 'Walang infinite scroll dito. You can close the app and sleep well.',
    },
  },
];

