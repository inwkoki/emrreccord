// ===========================================================================
// Reference data — clinical content for the Reference & tools screen.
// Pure data, no logic. Add new reference content HERE (then wire a renderer
// + a SECTIONS entry in app.js). Verify all clinical values against a source.
// ===========================================================================
export const HA_P307 = "https://pharm.md.kku.ac.th/file/post/307/attachment/";

export const HA_P306 = "https://pharm.md.kku.ac.th/file/post/306/attachment/";

export const PRESSORS = [
  {
    key: "norepi", name: "Norepinephrine (Levophed)", massUnit: "mcg", weightBased: true,
    range: { lo: 0.01, hi: 2, unit: "mcg/kg/min" },
    note: "KKU: max ~2 mcg/kg/min (refractory shock). Mix in D5W (NOT NSS). Peripheral <=16 mcg/mL; central up to 64 mcg/mL. High dose >0.2 -> NPO + PPI.",
    preps: [
      { label: "4 mg / 250 mL  (16 mcg/mL, peripheral)", mg: 4, ml: 250 },
      { label: "8 mg / 125 mL  (64 mcg/mL, central)", mg: 8, ml: 125 },
    ],
  },
  {
    key: "epi", name: "Adrenaline / Epinephrine", massUnit: "mcg", weightBased: true,
    range: { lo: 0.01, hi: 2, unit: "mcg/kg/min" },
    note: "KKU: infusion 0.01-2 mcg/kg/min (refractory shock) via pump. Std 10 mg / 100 mL = 100 mcg/mL (1:10,000) in D5W or NSS.",
    preps: [
      { label: "10 mg / 100 mL  (100 mcg/mL, 1:10,000)", mg: 10, ml: 100 },
      { label: "4 mg / 250 mL  (16 mcg/mL)", mg: 4, ml: 250 },
    ],
  },
  {
    key: "dopamine", name: "Dopamine", massUnit: "mcg", weightBased: true,
    range: { lo: 2, hi: 20, unit: "mcg/kg/min" },
    note: "KKU: max 20 mcg/kg/min via pump. 2-5 renal · 5-10 inotrope · 10-20 pressor. Std 1 or 2 mg/mL in D5W or NSS.",
    preps: [
      { label: "1 mg/mL  (e.g. 250 mg / 250 mL)", mg: 250, ml: 250 },
      { label: "2 mg/mL  (e.g. 500 mg / 250 mL)", mg: 500, ml: 250 },
    ],
  },
  {
    key: "dobutamine", name: "Dobutamine", massUnit: "mcg", weightBased: true,
    range: { lo: 2, hi: 20, unit: "mcg/kg/min" },
    note: "KKU: max 40 mcg/kg/min (usual 2-20) via pump. Std 1-4 mg/mL (max conc 5 mg/mL) in D5W or NSS.",
    preps: [
      { label: "1 mg/mL  (e.g. 250 mg / 250 mL)", mg: 250, ml: 250 },
      { label: "2 mg/mL  (e.g. 500 mg / 250 mL)", mg: 500, ml: 250 },
      { label: "4 mg/mL  (e.g. 1000 mg / 250 mL)", mg: 1000, ml: 250 },
    ],
  },
  {
    key: "phenylephrine", name: "Phenylephrine", massUnit: "mcg", weightBased: true,
    range: { lo: 0.1, hi: 1.4, unit: "mcg/kg/min" },
    note: "Infusion 0.1-1.4 mcg/kg/min (approx 10-200 mcg/min). Bolus 50-200 mcg.",
    preps: [
      { label: "10 mg / 250 mL  (40 mcg/mL)", mg: 10, ml: 250 },
      { label: "50 mg / 250 mL  (200 mcg/mL)", mg: 50, ml: 250 },
      { label: "10 mg / 100 mL  (100 mcg/mL)", mg: 10, ml: 100 },
    ],
  },
  {
    key: "vasopressin", name: "Vasopressin", massUnit: "unit", weightBased: false,
    range: { lo: 0.01, hi: 0.04, unit: "U/min" },
    note: "Septic shock: fixed 0.03 U/min — not titrated, not weight-based.",
    preps: [
      { label: "20 U / 100 mL  (0.2 U/mL)", u: 20, ml: 100 },
      { label: "40 U / 100 mL  (0.4 U/mL)", u: 40, ml: 100 },
      { label: "20 U / 50 mL  (0.4 U/mL)", u: 20, ml: 50 },
    ],
  },
];

export const HIGH_ALERT = [
  {
    name: "Norepinephrine (Levophed)", tag: "Vasopressor", strength: "4 mg / 4 mL",
    url: HA_P307 + "Norepinephine%20injection.pdf",
    rows: [
      ["Std conc", "Peripheral <=16 mcg/mL (4 mg/250 mL); central up to 64 mcg/mL (8 mg/125 mL)"],
      ["Dose", "0.01-2 mcg/kg/min; usual max 2 (refractory shock)"],
      ["Diluent", "D5W ONLY — do NOT use NSS. Protect from light; discard if pink/brown/yellow", true],
      ["Incompat.", "Alkaline solutions (NaHCO3, whole blood)"],
      ["Caution", "High dose >0.2 mcg/kg/min: NPO + PPI, watch bowel ischaemia. Prefer central line; watch extravasation"],
      ["Monitor", "HR q15min x4 then q4h — report HR <60 or >100, BP <90/60 or >140/90; IV site q4h"],
    ],
  },
  {
    name: "Adrenaline / Epinephrine", tag: "Vasopressor", strength: "1 mg/mL (1:1,000)",
    url: HA_P306 + "Adrenaline%20injection.pdf",
    rows: [
      ["Routes", "IM/SC 1:1,000; IV bolus dilute to 1:10,000 (1 amp + 9 mL) for arrest / anaphylaxis; IV infusion via pump"],
      ["Infusion", "10 mg / 100 mL = 100 mcg/mL (1:10,000); dose 0.01-2 mcg/kg/min"],
      ["Diluent", "D5W or NSS; stable 24 h; protect from light"],
      ["Incompat.", "Aminophylline, NaHCO3, alkali. Compatible: dopamine, dobutamine"],
      ["Monitor", "HR (anaphylaxis q5-10min x30min; drip q1h) — report HR <70 or >120, BP <90/60 or >140/90"],
    ],
  },
  {
    name: "Dopamine", tag: "Inotrope / pressor", strength: "250 mg / 10 mL",
    url: HA_P306 + "Dopamine%20injection.pdf",
    rows: [
      ["Std conc", "1 mg/mL or 2 mg/mL in D5W or NSS; infusion pump"],
      ["Dose", "Max 20 mcg/kg/min — 2-5 renal · 5-10 inotrope · 10-20 pressor"],
      ["Caution", "Titrate slowly (abrupt BP shifts). Use within 24 h; discard if dark/pink. No alkaline (NaHCO3)"],
      ["Monitor", "HR q15min x4 then q1h — report HR <70 or >120, BP <90/60 or >140/90, urine <25 mL/hr"],
    ],
  },
  {
    name: "Dobutamine", tag: "Inotrope", strength: "250 mg / 20 mL",
    url: HA_P306 + "Dobutamine%20injection.pdf",
    rows: [
      ["Std conc", "1-4 mg/mL (max conc 5 mg/mL) in D5W or NSS; infusion pump only"],
      ["Dose", "Max 40 mcg/kg/min (usual 2-20)"],
      ["Caution", "Titrate slowly. Use within 24 h; pink tint OK, discard if dark brown. No alkaline (NaHCO3)"],
      ["Monitor", "HR q15min x4 then q1h — report HR <70 or >120, BP <90/60 or >140/90, urine <25 mL/hr"],
    ],
  },
  {
    name: "Amiodarone", tag: "Antiarrhythmic", strength: "150 mg / 3 mL (tab 200 mg)",
    url: HA_P306 + "Amiodarone.pdf",
    rows: [
      ["IV push", "150 mg over >=10 min (<=30 mg/min); in arrest may push over >3 min"],
      ["Infusion", "D5W ONLY — do NOT use NSS. Peripheral <=2 mg/mL over 1-2 h; central <=6 mg/mL", true],
      ["Max", "2.2 g/day. Long half-life 7-50 days; many interactions (digoxin, warfarin, phenytoin, quinolones, fentanyl)"],
      ["Monitor", "HR before + q15min x3 — report HR <70 or >120, BP <90/60; ECG (AV block, brady, long QT); IV site q1h x6h"],
    ],
  },
  {
    name: "Ketamine", tag: "Anaesthetic / analgesic", strength: "50 mg/mL (10 mL)",
    url: HA_P307 + "Ketamine%20injection.pdf",
    rows: [
      ["IV", "Dilute (NSS/SWFI/D5W), final <=2 mg/mL; initial 1-4.5 mg/kg; rate <=0.5 mg/kg/min or over >60 s"],
      ["Maint.", "IV drip 0.1-0.5 mg/min. IM 9-13 mg/kg"],
      ["Caution", "Rapid IV -> respiratory depression. Incompatible with barbiturates / diazepam (space 60 s). Avoid in pregnancy", true],
      ["Monitor", "BP q5min x5 then q4h — report BP <90/60 or >160/100, RR <12, HR <60, SpO2 <94%, sedation score >=2"],
    ],
  },
  {
    name: "Magnesium sulfate", tag: "Electrolyte", strength: "10% /10 mL · 50% /2 mL (1 g = 8 mEq)",
    url: HA_P307 + "Magnesium%20sulphate%20injection.pdf",
    rows: [
      ["Push", "10%: slow IV push <1 g/min. 50%: IV drip ONLY — never push", true],
      ["Rate/Max", "IV drip <150 mg/min. Max 2 g/hr (eclampsia up to 4 g/hr)"],
      ["Std conc", "2 g/100 mL (max 20%) in D5W or NSS via pump. Do NOT refrigerate (precipitates)"],
      ["Caution", "CKD 4-5 / AKI: reduce + monitor Mg & ECG. Contraindicated in ESRD on dialysis"],
      ["Monitor", "HR/BP/DTR/urine q4h — target Mg 1.6-2.2 mg/dL, report absent DTR, urine <0.5 mL/kg/hr"],
    ],
  },
  {
    name: "Potassium chloride", tag: "Electrolyte", strength: "20 mEq / 10 mL (2 mEq/mL)",
    url: HA_P307 + "Potassium%20chloride%20injection.pdf",
    rows: [
      ["Never push", "IV infusion pump ONLY — NEVER IV push. Never add to a hanging bag; invert to mix x10", true],
      ["Peripheral", "Conc <=80 mEq/L, rate <10 mEq/hr"],
      ["Central", "Conc <=200 mEq/L (20 mEq/100 mL), rate <20 mEq/hr"],
      ["Diluent", "NSS preferred (dextrose can worsen hypokalaemia)"],
      ["Caution", ">=10 mEq/hr needs sub-ICU/ICU with continuous ECG + K. Caution CKD5 / AKI / urine <25 mL/hr"],
      ["Monitor", "HR q4h (q1h if >10 mEq/hr) — K 3.5-5.0 mEq/L; ECG for hyperkalaemia"],
    ],
  },
  {
    name: "Calcium gluconate", tag: "Electrolyte", strength: "1 g / 10 mL (1 g = 90 mg Ca / 4.5 mEq)",
    url: HA_P306 + "Calcium%20gluconate%20injection.pdf",
    rows: [
      ["Emergency", "hyperK / hypoCa: undiluted slowly over >5-10 min (no push) or dilute 10-50 mg/mL (1 amp in D5W 50 mL)"],
      ["Infusion", "Dilute <10 mg/mL (1 amp in >=100 mL). Rate <=200 mg/min (fast -> paraesthesia / hypotension)", true],
      ["Incompat.", "Carbonate, bicarbonate, phosphate, sulfate (incl. MgSO4) -> precipitate"],
      ["Monitor", "HR/BP q15min x4 then q4h; ECG on slow push; report Ca >10.5, phosphate >4.5 mg/dL"],
    ],
  },
];

export const CODES_ADULT = [
  { name: "Cardiac Arrest (ACLS)", tag: "Adult", cls: "red", sections: [
    { label: "High-quality CPR", lines: [
      "Push >=2 in (5 cm), 100-120/min, full recoil",
      "30:2 without advanced airway; change compressor q2min",
      "With advanced airway: 1 breath q6s (10/min) + continuous compressions",
    ] },
    { label: "VF / pVT (shockable)", lines: [
      "Shock → CPR 2 min → IV/IO access",
      "Epinephrine q3-5 min; amiodarone/lidocaine for refractory",
    ] },
    { label: "Asystole / PEA", lines: ["Epinephrine ASAP → CPR 2 min; treat reversible causes"] },
    { label: "Shock energy", lines: ["Biphasic 120-200 J (per device; if unknown, max)", "Monophasic 360 J"] },
    { label: "Drugs", lines: [
      "Epinephrine 1 mg IV/IO q3-5 min",
      "Amiodarone 300 mg then 150 mg  —or—  Lidocaine 1-1.5 then 0.5-0.75 mg/kg",
    ] },
    { label: "Reversible causes (H's & T's)", lines: [
      "Hypovolemia · Hypoxia · H+ (acidosis) · Hypo-/hyperkalemia · Hypothermia",
      "Tension pneumothorax · Tamponade · Toxins · Thrombosis (pulmonary) · Thrombosis (coronary)",
    ] },
  ] },
  { name: "Bradycardia (with pulse)", tag: "Adult", cls: "amber", sections: [
    { label: "When to treat", lines: ["HR usually <50 with cardiopulmonary compromise (hypotension, AMS, shock, ischemic chest pain, acute HF)"] },
    { label: "Treatment", lines: [
      "Atropine 1 mg IV, repeat q3-5 min, max 3 mg",
      "If ineffective: transcutaneous pacing and/or",
      "Dopamine 5-20 mcg/kg/min  OR  Epinephrine 2-10 mcg/min infusion (titrate)",
      "Consider expert consult / transvenous pacing",
    ] },
    { label: "Causes", lines: ["MI/ischemia · drugs (CCB, BB, digoxin) · hypoxia · hyperkalemia"] },
  ] },
  { name: "Tachycardia (with pulse)", tag: "Adult", cls: "amber", sections: [
    { label: "Unstable", lines: ["HR usually >=150 with hypotension / AMS / shock / ischemic chest pain / acute HF → synchronized cardioversion (sedate)"] },
    { label: "Stable — narrow QRS", lines: ["Vagal maneuvers", "Adenosine if regular", "Beta-blocker or calcium-channel blocker", "Expert consult"] },
    { label: "Stable — wide QRS >=0.12 s", lines: ["Adenosine only if regular & monomorphic", "Antiarrhythmic infusion", "Expert consult"] },
    { label: "Doses", lines: [
      "Adenosine 6 mg rapid IV push + flush; 2nd dose 12 mg",
      "Procainamide 20-50 mg/min (stop if suppressed / hypotension / QRS >50% / max 17 mg/kg); maint 1-4 mg/min",
      "Amiodarone 150 mg over 10 min, repeat if VT recurs; maint 1 mg/min x6 h",
    ] },
  ] },
  { name: "Electrical Cardioversion", tag: "Adult", cls: "blue", sections: [
    { label: "Synchronized energy", lines: [
      "Atrial fibrillation 200 J",
      "Atrial flutter 200 J",
      "Narrow-complex tachycardia 100 J",
      "Monomorphic VT 100 J",
      "Polymorphic VT → unsynchronized high-energy shock (defibrillation)",
    ] },
    { label: "Notes", lines: ["Sedate whenever feasible", "Resync after each cardioversion", "If critical & sync delayed → unsynchronized shock"] },
  ] },
];

export const CODES_PEDS = [
  { name: "Cardiac Arrest (PALS)", tag: "Peds", cls: "red", sections: [
    { label: "High-quality CPR", lines: [
      "Push >=1/3 AP depth, 100-120/min, full recoil",
      "15:2 (2 rescuers, prepuberty) · 30:2 (1 rescuer or postpuberty)",
      "With advanced airway: continuous compressions + 1 breath q2-3s",
    ] },
    { label: "VF / pVT (shockable)", lines: ["Shock → CPR 2 min → epi q3-5 min", "Repeat shock → amiodarone or lidocaine"] },
    { label: "Asystole / PEA", lines: ["Epinephrine ASAP → CPR 2 min"] },
    { label: "Shock energy", lines: ["First 2 J/kg", "Second 4 J/kg", "Subsequent >=4 J/kg (max 10 J/kg or adult dose)"] },
    { label: "Drugs", lines: [
      "Epinephrine 0.01 mg/kg (0.1 mg/mL) IV/IO, max 1 mg, q3-5 min",
      "Amiodarone 5 mg/kg bolus (max 300 mg), may repeat up to 3 doses",
      "or Lidocaine 1 mg/kg",
    ] },
    { label: "Reversible causes", lines: [
      "Hypovolemia · Hypoxia · H+ · Hypoglycemia · Hypo-/hyperkalemia · Hypothermia",
      "Tension pneumothorax · Tamponade · Toxins · Thrombosis (pulmonary / coronary)",
    ] },
  ] },
  { name: "Bradycardia (with pulse)", tag: "Peds", cls: "amber", sections: [
    { label: "When to treat", lines: ["Cardiopulmonary compromise (AMS, shock, hypotension) despite oxygenation & ventilation"] },
    { label: "Treatment", lines: [
      "Start CPR if HR <60 with poor perfusion",
      "Epinephrine 0.01 mg/kg (0.1 mg/mL) IV/IO, max 1 mg",
      "Atropine 0.02 mg/kg IV/IO (min 0.1 mg, max single 0.5 mg), may repeat once — for vagal tone / primary AV block",
      "Consider transthoracic / transvenous pacing",
    ] },
    { label: "Causes", lines: ["Hypothermia · hypoxia · toxins/meds · raised ICP · vagal tone · heart block"] },
  ] },
  { name: "Tachycardia (with pulse)", tag: "Peds", cls: "amber", sections: [
    { label: "SVT vs sinus tach", lines: [
      "SVT: infant >=220, child >=180; P absent/abnormal, RR not variable, abrupt onset",
      "Sinus tach: infant <220, child <180; P present/normal, variable RR",
    ] },
    { label: "Unstable", lines: [
      "Narrow (SVT): adenosine if IV/IO in place, or synchronized cardioversion",
      "Wide (VT): synchronized cardioversion (expert consult before more drugs)",
    ] },
    { label: "Stable", lines: [
      "Narrow (SVT): vagal maneuvers → adenosine",
      "Wide: if regular & monomorphic, consider adenosine; expert consult",
    ] },
    { label: "Doses", lines: [
      "Adenosine 0.1 mg/kg (max 6 mg) rapid push + flush; repeat 0.2 mg/kg (max 12 mg)",
      "Synchronized cardioversion 0.5-1 J/kg; if ineffective 2 J/kg",
    ] },
  ] },
];

export const RSI_DRUGS = [
  { name: "Etomidate", tag: "Induction", rows: [
    ["Dose", "0.3 mg/kg IV"],
    ["Onset", "15-45 s · duration 3-5 min"],
    ["Notes", "Haemodynamically neutral — good in shock / head injury. Myoclonus; transient adrenal suppression"],
  ] },
  { name: "Ketamine", tag: "Induction", rows: [
    ["Dose", "1-2 mg/kg IV (~1.5)"],
    ["Onset", "45-60 s · duration 10-20 min"],
    ["Notes", "Maintains BP, bronchodilator — good in shock / asthma"],
    ["Caution", "Severe uncontrolled HTN, significant CAD / aortic dissection; emergence phenomena", true],
  ] },
  { name: "Propofol", tag: "Induction", rows: [
    ["Dose", "1.5-2.5 mg/kg IV"],
    ["Onset", "15-45 s · duration 5-10 min"],
    ["Caution", "Hypotension — avoid or reduce dose in shock / hypovolaemia", true],
  ] },
  { name: "Midazolam", tag: "Induction", rows: [
    ["Dose", "0.1-0.3 mg/kg IV"],
    ["Onset", "30-60 s"],
    ["Caution", "Hypotension, respiratory depression; unreliable as sole induction agent", true],
  ] },
  { name: "Fentanyl", tag: "Adjunct", rows: [
    ["Dose", "1-3 mcg/kg IV"],
    ["Notes", "Blunts sympathetic response to laryngoscopy"],
    ["Caution", "Hypotension / apnoea; chest-wall rigidity with high dose or rapid push", true],
  ] },
  { name: "Succinylcholine", tag: "Paralytic — depolarising", rows: [
    ["Dose", "1-1.5 mg/kg IV (peds <10 y: 2 mg/kg)"],
    ["Onset", "45-60 s · duration 6-10 min"],
    ["Contraindic.", "Hyperkalaemia; burns / crush / denervation / spinal cord injury >48-72 h; personal or family history of malignant hyperthermia; neuromuscular disease; pseudocholinesterase deficiency", true],
  ] },
  { name: "Rocuronium", tag: "Paralytic — non-depol.", rows: [
    ["Dose", "1-1.2 mg/kg IV (RSI)"],
    ["Onset", "45-60 s · duration 45-70 min"],
    ["Notes", "No major contraindication except hypersensitivity. Long duration — ensure ongoing sedation; reversible with sugammadex"],
  ] },
  { name: "Atropine", tag: "Paeds pre-treat", rows: [
    ["Dose", "0.02 mg/kg IV (min 0.1 mg, max 0.5 mg)"],
    ["Notes", "Consider for bradycardia prophylaxis in infants / young children"],
  ] },
];

export const TBI_GROUPS = [
  {
    name: "Group 1 — Low risk", cls: "green", need: "Must have ALL of the following",
    items: ["Asymptomatic", "GCS 15", "No headache", "Scalp injury only — bruise or laceration"],
    dispo: "Discharge home with a head-injury advice sheet",
  },
  {
    name: "Group 2 — Moderate risk", cls: "amber", need: "Any ONE of the following",
    items: [
      "GCS 13-14",
      "OR GCS 15 with any of: vomiting (<2 episodes), history of loss of consciousness, headache, post-traumatic amnesia / transient LOC (seconds), risk of coagulopathy, or drug / alcohol intoxication",
    ],
    dispo: "Observe / manage per protocol (chart 4)",
  },
  {
    name: "Group 3 — High risk", cls: "red", need: "Any ONE of the following",
    items: [
      "GCS 13-14 persisting after 1-2 h observation",
      "Suspected open skull fracture and/or skull base fracture",
      "Vomiting >2 episodes",
      "Fall in GCS >=2 points, not clearly from seizures, drugs, poor cerebral perfusion or metabolic cause",
      "Focal neurological signs",
      "Post-traumatic seizure",
      "Age >=60",
    ],
    dispo: "CT brain / neurosurgical pathway (chart 5)",
  },
];

export const PEDS_VITALS = {
  tables: [
    { title: "Heart rate (at rest, /min)", cols: ["Age", "HR"], rows: [
      ["Birth", "100-180"], ["1 wk - 3 mo", "100-220"], ["3 mo - 2 yr", "80-150"],
      ["2-10 yr", "70-110"], [">10 yr", "55-90"],
    ] },
    { title: "Respiratory rate (upper limit, /min)", cols: ["Age", "RR"], rows: [
      ["Birth - 2 mo", "< 60"], ["2 mo - 1 yr", "< 50"], ["1-5 yr", "< 40"], ["> 5 yr", "< 20-30"],
    ] },
    { title: "Hypotension — systolic BP (mmHg)", cols: ["Age", "SBP <"], rows: [
      ["Newborn", "< 60"], ["1-12 mo", "< 70"], ["1-10 yr", "70 + 2 × age"], [">10 yr", "< 90"],
    ] },
    { title: "ETT size & depth (by age)", cols: ["Item", "Formula"], rows: [
      ["Size — uncuffed", "age/4 + 4 mm"], ["Size — cuffed", "age/4 + 3.5 mm"], ["Depth at lip", "age/2 + 12 cm"],
    ] },
  ],
  foot: "Source: Pediatric Survival Guide (Ped-in-a-page). Neonatal ETT ≈ 3.0-3.5 (uncuffed) / 3.0 (cuffed).",
};

export const PEDS_DRUGS = [
  { cat: "Antipyretic / analgesic", drugs: [
    { n: "Paracetamol", d: "10-15 mg/kg/dose PO q4-6h (max 90 mg/kg/day)", p: "syr 120 & 250 mg/5 mL · drop 60 mg/0.6 mL · tab 325/500 mg" },
    { n: "Ibuprofen", d: "5-10 mg/kg/dose PO q6-8h (max 40 mg/kg/day)", p: "syr 100 mg/5 mL · tab 200/400 mg" },
  ] },
  { cat: "Antihistamine", drugs: [
    { n: "Cetirizine", d: "2-6 yr: 5 mg q12-24h · >6 yr: 10 mg q24h", p: "syr 5 mg/5 mL · tab 10 mg" },
    { n: "Chlorpheniramine (CPM)", d: "0.35 mg/kg/day PO ÷ q6-8h · IV 0.25 mg/kg/dose q6h (anaphylaxis)", p: "syr 2 mg/5 mL · tab 4 mg · IV 10 mg/mL" },
    { n: "Hydroxyzine", d: "1-2 mg/kg/day PO ÷ q6-8h", p: "syr 10 mg/5 mL · tab 10/25 mg" },
    { n: "Diphenhydramine (Benadryl)", d: "5 mg/kg/day PO ÷ q6-8h", p: "syr 12.5 mg/5 mL" },
  ] },
  { cat: "Cough / mucolytic", drugs: [
    { n: "Bromhexine", d: "<2 yr 1 mg · 2-5 yr 2 mg · 5-10 yr 4 mg · >10 yr 8 mg — bid/tid", p: "syr 4 mg/5 mL · tab 8 mg" },
    { n: "Carbocysteine", d: "<5 yr 125 mg · 5-12 yr 250 mg · >12 yr 500 mg — tid", p: "syr 250 mg/5 mL (kids 100 mg/5 mL)" },
    { n: "Acetylcysteine", d: "50-100 mg/dose x2-4/day (or 20-30 mg/kg/day ÷ q8-12h)", p: "sachet 100/200 mg · tab 600 mg" },
    { n: "Guaifenesin (GG)", d: "<2 yr 12 mg/kg/day ÷ q6-8h · 2-5 yr 50-100 mg · 6-11 yr 100-200 mg — q6-8h", p: "100 mg/5 mL" },
    { n: "Dextromethorphan", d: "1-2 mg/kg/day ÷ q6-8h (max 2-6 yr 30 · 6-12 yr 60 · >12 yr 120 mg/day)", p: "15 mg/tab" },
  ] },
  { cat: "Decongestant", drugs: [
    { n: "Pseudoephedrine", d: "1 mg/kg/dose PO q6-8h", p: "syr 30 mg/5 mL · tab 60 mg" },
    { n: "Oxymetazoline (nasal)", d: "<6 yr 0.025% · >6 yr 0.05% · 1-2 drops/puffs bid — max 3-5 days", p: "drop 0.025/0.05% · spray 0.05%" },
  ] },
  { cat: "Asthma / nebulized", drugs: [
    { n: "Salbutamol (neb)", d: "0.05-0.15 mg/kg/dose + NSS to 4 mL, q20min x2-3 (acute); or ½ NB <20 kg, 1 NB >20 kg", p: "nebule 2.5 mg/2.5 mL · soln 5 mg/mL (0.03 mL/kg)" },
    { n: "Ipratropium/fenoterol (Berodual, neb)", d: "<20 kg 250 mcg (½ NB) · >20 kg 500 mcg (1 NB) q6-8h", p: "500 mcg / 4 mL neb" },
    { n: "Adrenaline (neb, croup)", d: "0.05-0.5 mL/kg/dose of 1:1000 + NSS to 4 mL (max <4 yr 2.5 mL · >4 yr 5 mL)", p: "1:1000 (1 mg/mL)" },
    { n: "Terbutaline", d: "0.01 mg/kg/dose IM/SC (max 0.4 mg)", p: "0.5 mg/mL" },
    { n: "Adrenaline (anaphylaxis, IM)", d: "0.01 mg/kg (0.01 mL/kg of 1:1000) IM thigh q5-15min (max 0.3 mL child / 0.5 mL adol.)", p: "1:1000 (1 mg/mL)" },
  ] },
  { cat: "Antiemetic / GI", drugs: [
    { n: "Domperidone", d: "0.2-0.4 mg/kg/dose PO q6-8h ac (>6 mo)", p: "syr 5 mg/5 mL · tab 10 mg" },
    { n: "Ondansetron", d: "0.15 mg/kg/dose IV/PO q8h", p: "IV 4 mg/amp · tab 8 mg" },
    { n: "Metoclopramide (Plasil)", d: "0.1 mg/kg/dose IV/PO q6-8h", p: "IV 10 mg/amp · tab 10 mg" },
    { n: "Dimenhydrinate", d: "1 mg/kg/dose IV/PO q6-8h", p: "IV 50 mg/amp · tab 50 mg" },
    { n: "Omeprazole", d: "0.5-2 mg/kg/day PO/IV q12-24h (max 50 mg/dose)", p: "IV 40 mg/vial · tab 20 mg" },
    { n: "Famotidine", d: "0.5 mg/kg/dose PO q12-24h", p: "tab 20/40 mg" },
    { n: "Lactulose", d: "1-3 mL/kg/day PO (max 60 mL)", p: "10 g/15 mL" },
    { n: "PEG (Forlax)", d: "disimpaction 1 g/kg/day; maintenance 0.5-1 g/kg/day", p: "10 g/sachet" },
  ] },
  { cat: "Steroid", drugs: [
    { n: "Prednisolone", d: "1-2 mg/kg/day PO (max 60 mg/day)", p: "5 mg/tab" },
    { n: "Dexamethasone", d: "croup 0.15-0.6 mg/kg IM/PO single; airway oedema 0.5-2 mg/kg/day IV ÷ q6h (max 8-10 mg/dose)", p: "IV 4 mg/mL" },
    { n: "Hydrocortisone", d: "5 mg/kg/dose IV q6h (asthma / anaphylaxis)", p: "IV 100 mg/vial" },
    { n: "Methylprednisolone", d: "1-2 mg/kg loading then 0.5-1 mg/kg/dose IV q6h", p: "IV 40 mg/mL" },
  ] },
  { cat: "Seizure / sedation", drugs: [
    { n: "Diazepam", d: "0.3 mg/kg/dose IV; 0.5 mg/kg/dose rectal", p: "IV 10 mg/2 mL · tab 2/5 mg" },
    { n: "Midazolam", d: "0.2 mg/kg IM (seizure alt); 0.05-0.1 mg/kg IV (max 5-10 mg)", p: "IV 5 mg/mL" },
    { n: "Phenobarbital", d: "load 20 mg/kg IV; maintenance 4-6 mg/kg/day ÷ q12h", p: "IV 200 mg/mL" },
    { n: "Phenytoin", d: "load 20 mg/kg IV (NSS only); maintenance 5-8 mg/kg/day ÷ q8-12h", p: "IV 250 mg/5 mL" },
    { n: "Sodium valproate", d: "load 20-40 mg/kg; maintenance 15-60 mg/kg/day ÷ q8-12h", p: "IV 100 mg/mL · soln 200 mg/mL" },
    { n: "Levetiracetam", d: "load 20-40 mg/kg; maintenance 20-80 mg/kg/day ÷ q12h", p: "IV/soln 100 mg/mL · tab 250/500 mg" },
  ] },
  { cat: "Antiviral", drugs: [
    { n: "Oseltamivir", d: "≤15 kg 30 mg · 15-23 kg 45 mg · 23-40 kg 60 mg · >40 kg 75 mg — bid x5 days", p: "75 mg/cap (infant/preterm dosing differs)" },
    { n: "Acyclovir", d: "HSV: 3 mo-12 yr 30-45 mg/kg/day IV ÷ q8h · VZV (chickenpox): PO 80 mg/kg/day ÷ 4-5 (max 800 mg/dose)", p: "IV vial · tab 200/400/800 mg" },
  ] },
  { cat: "Common antibiotics", drugs: [
    { n: "Amoxicillin", d: "40-90 mg/kg/day PO ÷ q8-12h (max 4 g/day)", p: "syr 125 & 250 mg/5 mL · cap 250/500 mg" },
    { n: "Amoxicillin/clavulanate", d: "30-90 mg/kg/day (of amox) PO ÷ q8-12h — use 7:1 ratio", p: "syr 228/457/642 mg/5 mL" },
    { n: "Cloxacillin", d: "50-100 mg/kg/day PO ÷ q6h (IV 100-200 mg/kg/day ÷ q4-6h)", p: "syr 125 mg/5 mL · cap 250/500 mg" },
    { n: "Dicloxacillin", d: "<40 kg: 12.5-25 mg/kg/day PO ÷ q6h · >40 kg: 125-250 mg qid (not in newborns)", p: "syr 62.5 mg/5 mL · cap 250/500 mg" },
    { n: "Cephalexin", d: "25-50 mg/kg/day PO ÷ q6-8h (up to 100 for severe, max 4 g)", p: "syr 125 & 250 mg/5 mL" },
    { n: "Cefaclor", d: "20-40 mg/kg/day PO ÷ q8h (infant >1 mo)", p: "syr 125 mg/5 mL" },
    { n: "Cefdinir", d: "14 mg/kg/day PO ÷ q12-24h (7 mg/kg/dose q12h; max 600 mg)", p: "syr 125 mg/5 mL · cap 300 mg" },
    { n: "Ceftriaxone", d: "50-75 mg/kg/day IV/IM ÷ q12-24h; 100 mg/kg/day (meningitis), max 4 g", p: "0.5 & 1 g/vial" },
    { n: "Azithromycin", d: "CAP: 10 mg/kg day 1 then 5 mg/kg/day (days 2-5); OM/sinusitis: 10 mg/kg OD x3 days", p: "syr 200 mg/5 mL · tab" },
    { n: "Erythromycin", d: "30-50 mg/kg/day PO ÷ q6-8h", p: "syr 125 mg/5 mL" },
    { n: "Penicillin V", d: "25-50 mg/kg/day PO ÷ q6h", p: "syr 125 mg/5 mL (200,000 u)" },
    { n: "Co-trimoxazole", d: "8 mg/kg/day (of TMP) PO ÷ q12h — i.e. 4 mg/kg/dose (max 160 mg TMP)", p: "syr 40/200 mg/5 mL" },
    { n: "Metronidazole", d: "20-40 mg/kg/day PO/IV ÷ q8h (max 1.5 g)", p: "tab 200/400 mg · IV" },
    { n: "Clindamycin", d: "10-40 mg/kg/day PO/IV ÷ q6-8h", p: "cap 150/300 mg · IV 600 mg/vial" },
  ] },
];

export const ELYTE_CORRECTION = [
  { name: "Hypoglycaemia", tag: "Glucose", rows: [
    ["Peds", "Dextrose 0.5 g/kg IV → D10W 5 mL/kg (or D25W 2 mL/kg)"],
    ["Neonate", "D10W 2 mL/kg"],
    ["Adult", "25-50 mL D50W (12.5-25 g) IV"],
    ["Then", "recheck glucose; start maintenance dextrose"],
  ] },
  { name: "Hypokalaemia", tag: "K+", rows: [
    ["Peds", "KCl 0.5-1 mEq/kg IV over 1-2 h (max 1 mEq/kg per dose)"],
    ["Rate/limit", "peripheral conc <=80 mEq/L & <10 mEq/h; >=10 mEq/h needs ECG monitoring", true],
    ["Never", "IV push — infusion pump only (see High-alert)", true],
  ] },
  { name: "Hypocalcaemia", tag: "Ca2+", rows: [
    ["Peds", "Calcium gluconate 10% 0.5-1 mL/kg IV slow (50-100 mg/kg), max 2 g"],
    ["Adult", "1-2 g calcium gluconate IV over 10 min"],
    ["Rate", "<=200 mg/min; ECG monitor; stop if bradycardia; no push", true],
    ["Incompat.", "do not mix with bicarbonate / phosphate (see High-alert)"],
  ] },
  { name: "Hypomagnesaemia", tag: "Mg2+", rows: [
    ["Peds", "MgSO4 25-50 mg/kg IV over 15-30 min (max 2 g)"],
    ["Adult", "MgSO4 1-2 g IV over 15-60 min"],
    ["Rate", "IV drip <150 mg/min; 50% MgSO4 must not be IV push", true],
  ] },
  { name: "Symptomatic hyponatraemia", tag: "Na+", cls: "amber", rows: [
    ["Peds", "3% NaCl 3-5 mL/kg IV over 10-20 min (seizing); repeat to stop seizure"],
    ["Adult", "3% NaCl 100 mL IV over 10 min, may repeat x2"],
    ["Caution", "raise Na slowly (<8-10 mEq/L / 24 h) — osmotic demyelination risk", true],
  ] },
  { name: "Hyperkalaemia", tag: "K+ high", cls: "red", sections: [
    { label: "1. Stabilise myocardium", lines: ["Calcium gluconate 10% 0.5-1 mL/kg (~60 mg/kg) IV slow — ECG monitor"] },
    { label: "2. Shift K into cells", lines: ["Salbutamol nebuliser", "Insulin 0.1 U/kg + dextrose 0.5 g/kg IV", "NaHCO3 1-2 mEq/kg IV (if acidotic)"] },
    { label: "3. Remove K", lines: ["Furosemide", "Cation-exchange resin (Kayexalate)", "Dialysis if severe / refractory"] },
  ] },
];

// PECARN paediatric head-injury CT rule. ci-TBI = clinically important TBI
// needing acute intervention. >=2 yr adapted from the California ACEP /
// Choosing Wisely decision guide; <2 yr from the validated PECARN rule.
export const PECARN = [
  { name: "High risk → CT", tag: "≥2 yr", cls: "red",
    need: "CT recommended if ANY (ci-TBI ~4.3%)",
    items: [
      "GCS < 15",
      "Signs of basilar skull fracture",
      "Altered mental status — agitation, somnolence, slow response, repetitive questions",
    ],
    dispo: "Obtain CT head" },
  { name: "Intermediate risk", tag: "≥2 yr", cls: "amber",
    need: "No high-risk features, but ANY of (ci-TBI ~0.8%)",
    items: [
      "Vomiting",
      "Loss of consciousness",
      "Severe headache",
      "Severe mechanism: fall >5 ft · MVA with ejection/rollover/fatality · bike or pedestrian vs vehicle without helmet · struck by high-impact object",
    ],
    dispo: "Observation vs CT — shared decision-making (multiple vs isolated factors · worsening during observation · physician experience · parental preference)" },
  { name: "Low risk", tag: "≥2 yr", cls: "green",
    need: "None of the above (ci-TBI <0.05%)",
    items: ["No high- or intermediate-risk features"],
    dispo: "CT not indicated — observe" },
  { name: "High risk → CT", tag: "<2 yr", cls: "red",
    need: "CT recommended if ANY (ci-TBI ~4.4%)",
    items: ["GCS < 15", "Palpable skull fracture", "Altered mental status"],
    dispo: "Obtain CT head" },
  { name: "Intermediate risk", tag: "<2 yr", cls: "amber",
    need: "No high-risk features, but ANY of (ci-TBI ~0.9%)",
    items: [
      "Occipital, parietal or temporal scalp haematoma",
      "Loss of consciousness >=5 seconds",
      "Severe mechanism of injury",
      "Not acting normally per parent",
    ],
    dispo: "Observation vs CT — shared decision-making" },
  { name: "Low risk", tag: "<2 yr", cls: "green",
    need: "None of the above (ci-TBI <0.02%)",
    items: ["No high- or intermediate-risk features"],
    dispo: "CT not indicated — observe" },
];
