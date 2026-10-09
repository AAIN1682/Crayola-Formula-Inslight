import type {
  ActivityEvent,
  AgeGroup,
  DemoDataset,
  DocumentStatus,
  EvidenceDocument,
  Formula,
  FormulaLifecycle,
  Ingredient,
  MaterialRole,
  MonitoringAlert,
  PhysicalForm,
  Person,
  ProductCategory,
  RawMaterial,
  ReviewDecision,
  ReviewStatus,
  ScreeningRun,
  Submission,
  SubmissionOutcome,
  SubmissionSnapshotIngredient,
} from '../types/domain';
import { shiftDays, startOfToday } from '../utils/formatting';
import { computeScreening, snapshotIngredients } from '../utils/screening';
import { mapLegacyAge } from '../utils/audience';

/**
 * Synthetic seed dataset for the Formula Insight demo workspace.
 *
 * Every record below is invented for demonstration. Material identifiers, suppliers,
 * thresholds and historical outcomes are illustrative and carry no real-world meaning.
 */

/* -------------------------------------------------------------- people */

export const PEOPLE: Person[] = [
  { id: 'usr-dana', name: 'Dana Whitfield', role: 'Formulation Scientist', initials: 'DW' },
  { id: 'usr-marcus', name: 'Marcus Ellery', role: 'Product Safety Specialist', initials: 'ME' },
  { id: 'usr-priya', name: 'Priya Raman', role: 'Regulatory Reviewer', initials: 'PR' },
  { id: 'usr-theo', name: 'Theo Kowalski', role: 'R&D Manager', initials: 'TK' },
  { id: 'usr-elena', name: 'Elena Barros', role: 'Formulation Scientist', initials: 'EB' },
];

/* ------------------------------------------------------- raw materials */

type DocPlan = DocumentStatus | 'none';

interface MaterialSeed {
  id: string;
  name: string;
  supplier: string;
  role: MaterialRole;
  ceiling?: number;
  expert?: boolean;
  lab?: boolean;
  sds: DocPlan;
  coa?: DocPlan;
  labReport?: DocPlan;
  summary: string;
  usageNote: string;
}

const MATERIAL_SEEDS: MaterialSeed[] = [
  {
    id: 'RM-101',
    name: 'Aqua Base Concentrate',
    supplier: 'Northbridge Chemworks',
    role: 'Carrier',
    sds: 'available',
    summary: 'Deionised water carrier used as the balance phase across liquid and paste products.',
    usageNote: 'Used in a historically accepted demo formula as the primary carrier.',
  },
  {
    id: 'RM-102',
    name: 'Polyol Humectant HX-2',
    supplier: 'Marlow Specialty',
    role: 'Humectant',
    ceiling: 25,
    sds: 'available',
    coa: 'available',
    summary: 'Humectant blend that keeps marker ink and glue from drying in the applicator.',
    usageNote: 'Appears in several demo formulas with recorded outcomes in the synthetic history.',
  },
  {
    id: 'RM-103',
    name: 'Cyan Dispersion Pigment C-14',
    supplier: 'Helix Colour Labs',
    role: 'Colorant',
    ceiling: 12,
    sds: 'available',
    coa: 'available',
    summary: 'Aqueous cyan pigment dispersion supplied at nominal 40% solids.',
    usageNote: 'Used in a historically accepted demo formula at comparable loadings.',
  },
  {
    id: 'RM-104',
    name: 'Magenta Dispersion Pigment M-21',
    supplier: 'Helix Colour Labs',
    role: 'Colorant',
    ceiling: 12,
    sds: 'available',
    coa: 'none',
    summary: 'Aqueous magenta pigment dispersion. The supplier certificate of analysis has not been received.',
    usageNote: 'Recorded feedback in the synthetic history asked for colorant certificates.',
  },
  {
    id: 'RM-105',
    name: 'Yellow Dispersion Pigment Y-09',
    supplier: 'Helix Colour Labs',
    role: 'Colorant',
    ceiling: 12,
    sds: 'available',
    coa: 'available',
    summary: 'Aqueous yellow pigment dispersion used across paints, markers and modeling compounds.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
  {
    id: 'RM-106',
    name: 'Carbon Dispersion Black K-02',
    supplier: 'Westfall Pigments',
    role: 'Colorant',
    ceiling: 4,
    sds: 'available',
    coa: 'available',
    summary: 'Carbon-based black dispersion for crayons and dry-erase inks.',
    usageNote: 'Used in a historically accepted demo formula at low loadings.',
  },
  {
    id: 'RM-107',
    name: 'Acrylic Binder Emulsion AB-30',
    supplier: 'Keystone Polymers',
    role: 'Binder',
    ceiling: 30,
    lab: true,
    sds: 'available',
    coa: 'available',
    labReport: 'available',
    summary: 'Film-forming acrylic emulsion used as the binder phase in poster and finger paints.',
    usageNote: 'Demo rule checks request a laboratory report for this binder family.',
  },
  {
    id: 'RM-108',
    name: 'Vinyl Acetate Copolymer VC-11',
    supplier: 'Keystone Polymers',
    role: 'Binder',
    ceiling: 25,
    sds: 'available',
    summary: 'Copolymer emulsion binder used in tempera-style paints.',
    usageNote: 'Appears in demo formulas with recorded outcomes in the synthetic history.',
  },
  {
    id: 'RM-109',
    name: 'Nonionic Surfactant NS-7',
    supplier: 'Marlow Specialty',
    role: 'Surfactant',
    ceiling: 2.5,
    sds: 'outdated',
    summary: 'Wetting agent that controls flow in markers and gel glues. The safety data sheet on file is superseded.',
    usageNote: 'The supplier issued a revised document set in the demo monitoring feed.',
  },
  {
    id: 'RM-110',
    name: 'Preservative Blend PB-3',
    supplier: 'Avery Lane Ingredients',
    role: 'Preservative',
    ceiling: 1,
    sds: 'available',
    coa: 'available',
    summary: 'Current-generation preservative blend used across the water-based portfolio.',
    usageNote: 'Used in a historically accepted demo formula as the preservative system.',
  },
  {
    id: 'RM-111',
    name: 'Preservative Blend PB-9 (legacy)',
    supplier: 'Avery Lane Ingredients',
    role: 'Preservative',
    ceiling: 0.5,
    expert: true,
    lab: true,
    sds: 'available',
    coa: 'available',
    labReport: 'none',
    summary:
      'Legacy preservative blend retained in one modeling-compound formula. Flagged in this demo workspace for specialist assessment.',
    usageNote:
      'The demo rule set routes this material to a product safety specialist before any formula containing it progresses.',
  },
  {
    id: 'RM-112',
    name: 'Calcium Carbonate Filler F-55',
    supplier: 'Granite Hill Minerals',
    role: 'Filler',
    ceiling: 60,
    sds: 'available',
    coa: 'available',
    summary: 'Ground mineral filler providing body in crayons, chalks and watercolour pans.',
    usageNote: 'Used in a historically accepted demo formula as the bulk phase.',
  },
  {
    id: 'RM-113',
    name: 'Paraffin Wax Grade W-18',
    supplier: 'Granite Hill Minerals',
    role: 'Binder',
    ceiling: 65,
    lab: true,
    sds: 'available',
    labReport: 'available',
    summary: 'Refined wax grade forming the structural phase of stick products.',
    usageNote: 'Recorded feedback in the synthetic history asked for wax grade confirmation.',
  },
  {
    id: 'RM-114',
    name: 'Stearate Processing Aid SA-4',
    supplier: 'Granite Hill Minerals',
    role: 'Processing aid',
    ceiling: 6,
    sds: 'available',
    summary: 'Processing aid that improves mould release and lay-down for stick products.',
    usageNote: 'Appears in demo formulas with recorded outcomes in the synthetic history.',
  },
  {
    id: 'RM-115',
    name: 'Cellulose Thickener T-12',
    supplier: 'Northbridge Chemworks',
    role: 'Rheology modifier',
    ceiling: 8,
    sds: 'available',
    summary: 'Cellulose-derived thickener controlling viscosity in inks, paints and gel glues.',
    usageNote: 'Recorded feedback in the synthetic history asked for thickener documentation.',
  },
  {
    id: 'RM-116',
    name: 'Food-Grade Starch Base S-30',
    supplier: 'Harvest Row Supply',
    role: 'Structuring agent',
    sds: 'available',
    coa: 'available',
    summary: 'Starch base providing structure and plasticity in modeling compounds.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
  {
    id: 'RM-117',
    name: 'Mineral Oil Conditioner MO-6',
    supplier: 'Marlow Specialty',
    role: 'Processing aid',
    ceiling: 5,
    sds: 'available',
    summary: 'Conditioning oil that keeps modeling compounds pliable.',
    usageNote: 'Appears in demo formulas with recorded outcomes in the synthetic history.',
  },
  {
    id: 'RM-118',
    name: 'Glycerin Softener GL-2',
    supplier: 'Harvest Row Supply',
    role: 'Humectant',
    ceiling: 12,
    sds: 'available',
    summary: 'Softening humectant used in dough-style products.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
  {
    id: 'RM-119',
    name: 'Sodium Chloride Grade NC-1',
    supplier: 'Harvest Row Supply',
    role: 'Structuring agent',
    ceiling: 15,
    sds: 'available',
    summary: 'Structuring salt used to control texture in modeling compounds.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
  {
    id: 'RM-120',
    name: 'Citric Acid pH Adjuster PA-8',
    supplier: 'Avery Lane Ingredients',
    role: 'pH adjuster',
    ceiling: 1.5,
    sds: 'available',
    summary: 'pH adjuster used to hold water-based systems in their working range.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
  {
    id: 'RM-121',
    name: 'Bittering Agent BA-5',
    supplier: 'Avery Lane Ingredients',
    role: 'Deterrent additive',
    ceiling: 0.02,
    lab: true,
    sds: 'available',
    coa: 'available',
    labReport: 'available',
    summary: 'Bittering additive included at trace levels as an ingestion deterrent.',
    usageNote: 'Demo rule checks request a laboratory report alongside the supplier documents.',
  },
  {
    id: 'RM-122',
    name: 'Silicone Defoamer DF-3',
    supplier: 'Northbridge Chemworks',
    role: 'Processing aid',
    ceiling: 0.5,
    sds: 'available',
    summary: 'Defoamer used during manufacture of glue and gel products.',
    usageNote: 'Recorded feedback in the synthetic history questioned the defoamer loading.',
  },
  {
    id: 'RM-123',
    name: 'Blue Dye Solution B-27',
    supplier: 'Westfall Pigments',
    role: 'Colorant',
    ceiling: 2,
    sds: 'none',
    coa: 'none',
    summary:
      'Recently introduced colorant. No supplier documents have been received in this demo workspace yet.',
    usageNote: 'Introduced in a current formula version with no supporting documents on file.',
  },
  {
    id: 'RM-124',
    name: 'PVA Resin Solution PV-14',
    supplier: 'Keystone Polymers',
    role: 'Binder',
    ceiling: 35,
    lab: true,
    sds: 'available',
    coa: 'available',
    labReport: 'available',
    summary: 'Polyvinyl acetate resin solution forming the adhesive phase of the glue range.',
    usageNote: 'Used in a historically accepted demo formula as the adhesive binder.',
  },
  {
    id: 'RM-125',
    name: 'Titanium White Dispersion W-01',
    supplier: 'Westfall Pigments',
    role: 'Opacifier',
    ceiling: 10,
    sds: 'available',
    coa: 'available',
    summary: 'White opacifying dispersion used to build coverage in paints and metallic sticks.',
    usageNote: 'Used in a historically accepted demo formula.',
  },
];

/* ---------------------------------------------------------- formulas */

interface IngredientSeed {
  name: string;
  rawMaterialId?: string;
  concentration: number;
  addedInVersion?: string;
  notes?: string;
}

interface FormulaSeed {
  id: string;
  name: string;
  version: string;
  category: ProductCategory;
  ageGroup: string;
  physicalForm: PhysicalForm;
  intendedUse: string;
  ownerId: string;
  reviewerId?: string;
  lifecycle: FormulaLifecycle;
  reviewStatus: ReviewStatus;
  description: string;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  screenedDaysAgo?: number;
  /** Version recorded on the seeded run — a mismatch marks the run outdated. */
  runVersion?: string;
  reviewDueInDays?: number;
  carrier: { name: string; rawMaterialId: string };
  rest: IngredientSeed[];
  /** Additional snapshot used when the formula has been edited since screening. */
  previousComposition?: IngredientSeed[];
  formulaDocuments?: { type: EvidenceDocument['type']; title: string; summary: string }[];
}

const FORMULA_SEEDS: FormulaSeed[] = [
  {
    id: 'FML-1001',
    name: 'ColorFlow Washable Marker',
    version: 'v3.1',
    category: 'Markers',
    ageGroup: '3+',
    physicalForm: 'Liquid',
    intendedUse: 'Broad-line colouring marker for classroom and home craft use on paper.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Core washable ink platform. Third revision of the humectant system.',
    createdDaysAgo: 420,
    updatedDaysAgo: 18,
    screenedDaysAgo: 18,
    reviewDueInDays: 140,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 18 },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 8.5 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 4 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.8 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.4 },
      { name: 'Bittering Agent BA-5', rawMaterialId: 'RM-121', concentration: 0.015 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Washability panel study — ColorFlow v3.1',
        summary:
          'Synthetic internal study comparing wash-out performance of the v3.0 and v3.1 humectant systems on cotton substrates.',
      },
    ],
  },
  {
    id: 'FML-1002',
    name: 'ColorFlow Ultra Washable Marker',
    version: 'v1.4',
    category: 'Markers',
    ageGroup: '4+',
    physicalForm: 'Liquid',
    intendedUse: 'Higher-intensity marker ink for art sets, used on paper and card.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'awaiting-evidence',
    description: 'Ultra-intensity variant with a magenta pigment load and added surfactant.',
    createdDaysAgo: 210,
    updatedDaysAgo: 9,
    screenedDaysAgo: 9,
    reviewDueInDays: 95,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 16 },
      { name: 'Magenta Dispersion Pigment M-21', rawMaterialId: 'RM-104', concentration: 9.2 },
      { name: 'Nonionic Surfactant NS-7', rawMaterialId: 'RM-109', concentration: 1.4 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3.5 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.75 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.35 },
    ],
  },
  {
    id: 'FML-1003',
    name: 'StudioBright Poster Paint',
    version: 'v2.0',
    category: 'Paints',
    ageGroup: '3+',
    physicalForm: 'Liquid',
    intendedUse: 'Opaque poster paint applied by brush to paper, card and craft board.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Second-generation acrylic poster paint with improved opacity.',
    createdDaysAgo: 365,
    updatedDaysAgo: 31,
    screenedDaysAgo: 31,
    reviewDueInDays: 120,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Acrylic Binder Emulsion AB-30', rawMaterialId: 'RM-107', concentration: 22 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 9.5 },
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 5.5 },
      { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112', concentration: 6 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 2.5 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.9 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.3 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Opacity and dry-film study — StudioBright v2.0',
        summary:
          'Synthetic internal study recording contrast ratio and dry-film behaviour across three pigment loadings.',
      },
    ],
  },
  {
    id: 'FML-1004',
    name: 'StudioBright Tempera Paint',
    version: 'v1.2',
    category: 'Paints',
    ageGroup: '4+',
    physicalForm: 'Liquid',
    intendedUse: 'Tempera-style paint for classroom projects applied by brush or sponge.',
    ownerId: 'usr-theo',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'in-review',
    description: 'Copolymer tempera variant sharing the StudioBright pigment set.',
    createdDaysAgo: 180,
    updatedDaysAgo: 12,
    screenedDaysAgo: 12,
    reviewDueInDays: 80,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Vinyl Acetate Copolymer VC-11', rawMaterialId: 'RM-108', concentration: 18.5 },
      { name: 'Magenta Dispersion Pigment M-21', rawMaterialId: 'RM-104', concentration: 8.8 },
      { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112', concentration: 7.5 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 4 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 2 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.85 },
    ],
  },
  {
    id: 'FML-1005',
    name: 'SoftShape Modeling Compound',
    version: 'v4.0',
    category: 'Modeling Compounds',
    ageGroup: '3+',
    physicalForm: 'Paste',
    intendedUse: 'Pliable modeling compound for hand-shaping and moulding during play.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'in-review',
    description: 'Flagship modeling compound. Retains the legacy preservative blend.',
    createdDaysAgo: 540,
    updatedDaysAgo: 4,
    screenedDaysAgo: 4,
    reviewDueInDays: 30,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Food-Grade Starch Base S-30', rawMaterialId: 'RM-116', concentration: 34 },
      { name: 'Sodium Chloride Grade NC-1', rawMaterialId: 'RM-119', concentration: 9.5 },
      { name: 'Glycerin Softener GL-2', rawMaterialId: 'RM-118', concentration: 6.5 },
      { name: 'Mineral Oil Conditioner MO-6', rawMaterialId: 'RM-117', concentration: 3.2 },
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 1.8 },
      { name: 'Preservative Blend PB-9 (legacy)', rawMaterialId: 'RM-111', concentration: 0.6 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.3 },
    ],
  },
  {
    id: 'FML-1006',
    name: 'SoftShape Scented Modeling Compound',
    version: 'v1.0',
    category: 'Modeling Compounds',
    ageGroup: '4+',
    physicalForm: 'Paste',
    intendedUse: 'Scented modeling compound variant for hand-shaping during play.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'awaiting-evidence',
    description: 'New variant introducing a blue colorant that has no supplier documents yet.',
    createdDaysAgo: 46,
    updatedDaysAgo: 6,
    screenedDaysAgo: 6,
    reviewDueInDays: 60,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Food-Grade Starch Base S-30', rawMaterialId: 'RM-116', concentration: 33 },
      { name: 'Sodium Chloride Grade NC-1', rawMaterialId: 'RM-119', concentration: 9 },
      { name: 'Glycerin Softener GL-2', rawMaterialId: 'RM-118', concentration: 6.8 },
      { name: 'Mineral Oil Conditioner MO-6', rawMaterialId: 'RM-117', concentration: 3 },
      {
        name: 'Blue Dye Solution B-27',
        rawMaterialId: 'RM-123',
        concentration: 1.2,
        addedInVersion: 'v1.0',
        notes: 'New colorant introduced for the scented range.',
      },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.7 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.3 },
    ],
  },
  {
    id: 'FML-1007',
    name: 'BrightCore Crayon Classic',
    version: 'v5.2',
    category: 'Crayons',
    ageGroup: '3+',
    physicalForm: 'Solid stick',
    intendedUse: 'Standard wax crayon for drawing on paper and colouring books.',
    ownerId: 'usr-theo',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Long-running crayon platform with a stable wax and filler system.',
    createdDaysAgo: 720,
    updatedDaysAgo: 54,
    screenedDaysAgo: 54,
    reviewDueInDays: 165,
    carrier: { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112' },
    rest: [
      { name: 'Paraffin Wax Grade W-18', rawMaterialId: 'RM-113', concentration: 58 },
      { name: 'Stearate Processing Aid SA-4', rawMaterialId: 'RM-114', concentration: 3.5 },
      { name: 'Carbon Dispersion Black K-02', rawMaterialId: 'RM-106', concentration: 2.5 },
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 1.5 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Stick integrity and lay-down report — BrightCore v5.2',
        summary:
          'Synthetic internal study covering break strength, lay-down density and mould release across three wax lots.',
      },
    ],
  },
  {
    id: 'FML-1008',
    name: 'BrightCore Crayon Metallic',
    version: 'v2.1',
    category: 'Crayons',
    ageGroup: '6+',
    physicalForm: 'Solid stick',
    intendedUse: 'Metallic-effect wax crayon for craft and decorative drawing on paper.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'in-review',
    description: 'Metallic variant using the magenta pigment set pending certification documents.',
    createdDaysAgo: 250,
    updatedDaysAgo: 21,
    screenedDaysAgo: 21,
    reviewDueInDays: 72,
    carrier: { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112' },
    rest: [
      { name: 'Paraffin Wax Grade W-18', rawMaterialId: 'RM-113', concentration: 56 },
      { name: 'Stearate Processing Aid SA-4', rawMaterialId: 'RM-114', concentration: 3.2 },
      { name: 'Magenta Dispersion Pigment M-21', rawMaterialId: 'RM-104', concentration: 3.6 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 2.8 },
    ],
  },
  {
    id: 'FML-1009',
    name: 'SureBond School Glue',
    version: 'v3.0',
    category: 'Glue',
    ageGroup: '3+',
    physicalForm: 'Liquid',
    intendedUse: 'White school glue applied from a squeeze bottle to paper, card and fabric.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Historically accepted glue platform now approaching its scheduled reassessment.',
    createdDaysAgo: 610,
    updatedDaysAgo: 97,
    screenedDaysAgo: 97,
    reviewDueInDays: 12,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'PVA Resin Solution PV-14', rawMaterialId: 'RM-124', concentration: 26 },
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 5.5 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 1.5 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.7 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.25 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Bond strength and residue study — SureBond v3.0',
        summary:
          'Synthetic internal study recording peel strength on paper and residue behaviour after wash-out.',
      },
    ],
  },
  {
    id: 'FML-1010',
    name: 'SureBond Gel Glue',
    version: 'v1.6',
    category: 'Glue',
    ageGroup: '4+',
    physicalForm: 'Gel',
    intendedUse: 'Clear gel adhesive applied from a squeeze bottle for craft assembly.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'awaiting-evidence',
    description: 'Clear gel variant affected by the superseded surfactant document set.',
    createdDaysAgo: 230,
    updatedDaysAgo: 15,
    screenedDaysAgo: 15,
    reviewDueInDays: 88,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'PVA Resin Solution PV-14', rawMaterialId: 'RM-124', concentration: 23 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 4.2 },
      { name: 'Nonionic Surfactant NS-7', rawMaterialId: 'RM-109', concentration: 0.9 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.65 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.25 },
    ],
  },
  {
    id: 'FML-1011',
    name: 'ColorFlow Fine Line Marker',
    version: 'v2.2',
    category: 'Markers',
    ageGroup: '6+',
    physicalForm: 'Liquid',
    intendedUse: 'Fine-tip marker for detailed drawing and lettering on paper.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'not-started',
    description:
      'Fine-line variant. The pigment loading changed after the last screening run, so that result is outdated.',
    createdDaysAgo: 300,
    updatedDaysAgo: 2,
    screenedDaysAgo: 26,
    runVersion: 'v2.1',
    reviewDueInDays: 110,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 17 },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 9.4 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3.6 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.75 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.35 },
      { name: 'Bittering Agent BA-5', rawMaterialId: 'RM-121', concentration: 0.012 },
    ],
    previousComposition: [
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 17 },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 7.8 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3.6 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.75 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.35 },
      { name: 'Bittering Agent BA-5', rawMaterialId: 'RM-121', concentration: 0.012 },
    ],
    formulaDocuments: [
      {
        type: 'Correspondence',
        title: 'Pigment loading change note — ColorFlow Fine Line',
        summary:
          'Internal note recording the decision to raise the cyan dispersion from 7.8% to 9.4% for line intensity.',
      },
    ],
  },
  {
    id: 'FML-1012',
    name: 'AquaTone Watercolor Set',
    version: 'v1.1',
    category: 'Paints',
    ageGroup: '6+',
    physicalForm: 'Solid stick',
    intendedUse: 'Pressed watercolour pans activated with water and applied by brush to paper.',
    ownerId: 'usr-elena',
    lifecycle: 'draft',
    reviewStatus: 'not-started',
    description: 'Draft record. One ingredient is still missing its raw-material reference.',
    createdDaysAgo: 24,
    updatedDaysAgo: 3,
    carrier: { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112' },
    rest: [
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 12 },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 11 },
      { name: 'Magenta Dispersion Pigment M-21', rawMaterialId: 'RM-104', concentration: 10.5 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 6 },
      {
        name: 'Gum Arabic Binder (pending catalog entry)',
        concentration: 8,
        notes: 'Awaiting a raw-material record from the supplier onboarding queue.',
      },
    ],
  },
  {
    id: 'FML-1013',
    name: 'SoftShape Dough Starter Kit',
    version: 'v2.3',
    category: 'Modeling Compounds',
    ageGroup: '3+',
    physicalForm: 'Paste',
    intendedUse: 'Starter-kit modeling dough for hand-shaping and tool play.',
    ownerId: 'usr-theo',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Entry-level dough sharing the SoftShape starch system without the legacy preservative.',
    createdDaysAgo: 400,
    updatedDaysAgo: 63,
    screenedDaysAgo: 63,
    reviewDueInDays: 150,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Food-Grade Starch Base S-30', rawMaterialId: 'RM-116', concentration: 32 },
      { name: 'Sodium Chloride Grade NC-1', rawMaterialId: 'RM-119', concentration: 8.5 },
      { name: 'Glycerin Softener GL-2', rawMaterialId: 'RM-118', concentration: 6 },
      { name: 'Mineral Oil Conditioner MO-6', rawMaterialId: 'RM-117', concentration: 2.8 },
      { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 1.4 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.7 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.3 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Texture and shelf-stability report — SoftShape Starter v2.3',
        summary:
          'Synthetic internal study recording plasticity and moisture retention across a twelve-week hold.',
      },
    ],
  },
  {
    id: 'FML-1014',
    name: 'BrightCore Crayon Jumbo',
    version: 'v3.4',
    category: 'Crayons',
    ageGroup: '3+',
    physicalForm: 'Solid stick',
    intendedUse: 'Large-diameter crayon designed for early-years grip and paper colouring.',
    ownerId: 'usr-theo',
    lifecycle: 'active',
    reviewStatus: 'not-started',
    description: 'Jumbo format with a raised wax loading. Not screened in this workspace yet.',
    createdDaysAgo: 150,
    updatedDaysAgo: 34,
    reviewDueInDays: 45,
    carrier: { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112' },
    rest: [
      { name: 'Paraffin Wax Grade W-18', rawMaterialId: 'RM-113', concentration: 66 },
      { name: 'Stearate Processing Aid SA-4', rawMaterialId: 'RM-114', concentration: 3.4 },
      { name: 'Carbon Dispersion Black K-02', rawMaterialId: 'RM-106', concentration: 2.2 },
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 1.2 },
    ],
  },
  {
    id: 'FML-1015',
    name: 'SureBond Glitter Glue',
    version: 'v1.2',
    category: 'Glue',
    ageGroup: '6+',
    physicalForm: 'Gel',
    intendedUse: 'Decorative glitter gel adhesive applied from a fine-tip bottle to craft surfaces.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-marcus',
    lifecycle: 'active',
    reviewStatus: 'returned',
    description: 'Glitter variant carrying a defoamer loading well above the illustrative demo ceiling.',
    createdDaysAgo: 120,
    updatedDaysAgo: 7,
    screenedDaysAgo: 7,
    reviewDueInDays: 25,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'PVA Resin Solution PV-14', rawMaterialId: 'RM-124', concentration: 21 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 5 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 2.4 },
      { name: 'Silicone Defoamer DF-3', rawMaterialId: 'RM-122', concentration: 1.2 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.6 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.25 },
    ],
  },
  {
    id: 'FML-1016',
    name: 'ColorFlow Dry-Erase Marker',
    version: 'v1.0',
    category: 'Markers',
    ageGroup: '8+',
    physicalForm: 'Liquid',
    intendedUse: 'Dry-erase marker for whiteboard use in classroom settings.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'in-review',
    description: 'First dry-erase entry in the ColorFlow range.',
    createdDaysAgo: 70,
    updatedDaysAgo: 11,
    screenedDaysAgo: 11,
    reviewDueInDays: 65,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 14 },
      { name: 'Carbon Dispersion Black K-02', rawMaterialId: 'RM-106', concentration: 3.2 },
      { name: 'Nonionic Surfactant NS-7', rawMaterialId: 'RM-109', concentration: 2.1 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.7 },
    ],
  },
  {
    id: 'FML-1017',
    name: 'StudioBright Finger Paint',
    version: 'v2.5',
    category: 'Paints',
    ageGroup: '3+',
    physicalForm: 'Paste',
    intendedUse: 'Thick finger paint applied directly by hand to paper and craft board.',
    ownerId: 'usr-elena',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'complete',
    description: 'Direct skin-contact paint with a scheduled reassessment approaching.',
    createdDaysAgo: 480,
    updatedDaysAgo: 72,
    screenedDaysAgo: 72,
    reviewDueInDays: 26,
    carrier: { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101' },
    rest: [
      { name: 'Acrylic Binder Emulsion AB-30', rawMaterialId: 'RM-107', concentration: 17.5 },
      { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112', concentration: 8 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 5.5 },
      { name: 'Yellow Dispersion Pigment Y-09', rawMaterialId: 'RM-105', concentration: 3.2 },
      { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 2.4 },
      { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.85 },
      { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.3 },
      { name: 'Bittering Agent BA-5', rawMaterialId: 'RM-121', concentration: 0.012 },
    ],
    formulaDocuments: [
      {
        type: 'Laboratory Report',
        title: 'Skin-contact duration study — StudioBright Finger Paint v2.5',
        summary:
          'Synthetic internal study recording contact duration and wash-off behaviour in a supervised craft session.',
      },
    ],
  },
  {
    id: 'FML-1018',
    name: 'BrightCore Washable Crayon Twist',
    version: 'v1.3',
    category: 'Crayons',
    ageGroup: '4+',
    physicalForm: 'Solid stick',
    intendedUse: 'Twist-up washable crayon for paper colouring without sharpening.',
    ownerId: 'usr-dana',
    reviewerId: 'usr-priya',
    lifecycle: 'active',
    reviewStatus: 'in-review',
    description: 'Twist-barrel crayon using a softer wax and starch blend.',
    createdDaysAgo: 160,
    updatedDaysAgo: 28,
    screenedDaysAgo: 28,
    reviewDueInDays: 58,
    carrier: { name: 'Calcium Carbonate Filler F-55', rawMaterialId: 'RM-112' },
    rest: [
      { name: 'Paraffin Wax Grade W-18', rawMaterialId: 'RM-113', concentration: 52 },
      { name: 'Food-Grade Starch Base S-30', rawMaterialId: 'RM-116', concentration: 4 },
      { name: 'Magenta Dispersion Pigment M-21', rawMaterialId: 'RM-104', concentration: 3.2 },
      { name: 'Stearate Processing Aid SA-4', rawMaterialId: 'RM-114', concentration: 3.1 },
      { name: 'Titanium White Dispersion W-01', rawMaterialId: 'RM-125', concentration: 2.6 },
    ],
  },
];

/* ------------------------------------------------------- submissions */

interface SubmissionSeed {
  id: string;
  formulaId: string;
  version: string;
  outcome: SubmissionOutcome;
  reviewRounds: number;
  feedbackTheme: string;
  submittedDaysAgo: number;
  closedDaysAgo: number;
  /** Raw-material IDs dropped from the current formula for the historical snapshot. */
  drop?: string[];
  /** Concentration overrides applied to the historical snapshot. */
  adjust?: Record<string, number>;
  /** Extra ingredients that existed historically but not in the current formula. */
  add?: { name: string; rawMaterialId?: string; concentration: number }[];
  requestedChanges: string[];
  findings: { severity: 'high' | 'medium' | 'low'; title: string; detail: string }[];
  correspondence: { from: string; subject: string; body: string; dayOffset: number }[];
}

const SUBMISSION_SEEDS: SubmissionSeed[] = [
  {
    id: 'SUB-2301',
    formulaId: 'FML-1001',
    version: 'v2.8',
    outcome: 'AP',
    reviewRounds: 2,
    feedbackTheme: 'Washability substantiation',
    submittedDaysAgo: 690,
    closedDaysAgo: 640,
    adjust: { 'RM-102': 15.5, 'RM-103': 7.2 },
    requestedChanges: [
      'Provide the wash-out study for the revised humectant level.',
      'Confirm the bittering agent supplier documentation set.',
    ],
    findings: [
      {
        severity: 'low',
        title: 'Humectant level raised from the previous version',
        detail: 'Reviewer asked for the supporting wash-out study before closing the file.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — information request',
        body: 'Please share the wash-out panel study covering the revised humectant level, along with the current supplier document set for the bittering additive.',
        dayOffset: 18,
      },
      {
        from: 'Dana Whitfield',
        subject: 'Round 1 — response',
        body: 'Wash-out panel study attached. The bittering additive document set is current and unchanged from the previous submission.',
        dayOffset: 29,
      },
    ],
  },
  {
    id: 'SUB-2302',
    formulaId: 'FML-1003',
    version: 'v1.6',
    outcome: 'AP',
    reviewRounds: 1,
    feedbackTheme: 'Pigment specification',
    submittedDaysAgo: 620,
    closedDaysAgo: 586,
    adjust: { 'RM-107': 20, 'RM-125': 8 },
    drop: ['RM-112'],
    requestedChanges: ['Record the pigment grade on the composition sheet.'],
    findings: [
      {
        severity: 'low',
        title: 'Pigment grade not stated on the composition sheet',
        detail: 'Reviewer asked for the grade reference to be added to the record.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — clarification',
        body: 'Please state the pigment grade reference on the composition sheet so the record matches the supplier certificate.',
        dayOffset: 14,
      },
    ],
  },
  {
    id: 'SUB-2303',
    formulaId: 'FML-1005',
    version: 'v3.2',
    outcome: 'More Data Needed',
    reviewRounds: 3,
    feedbackTheme: 'Preservative system data',
    submittedDaysAgo: 540,
    closedDaysAgo: 470,
    adjust: { 'RM-111': 0.45, 'RM-116': 35 },
    requestedChanges: [
      'Provide a laboratory report covering the legacy preservative blend.',
      'Supply the preservative supplier specification at the declared loading.',
      'Confirm whether a current-generation preservative was evaluated.',
    ],
    findings: [
      {
        severity: 'high',
        title: 'Legacy preservative blend lacked a laboratory report',
        detail:
          'The file closed with additional data requested. The laboratory report was never added to this demo record.',
      },
      {
        severity: 'medium',
        title: 'Alternative preservative system not documented',
        detail: 'Reviewer asked whether a current-generation preservative had been evaluated.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — data request',
        body: 'The submission does not include a laboratory report for the legacy preservative blend. Please provide one together with the supplier specification at the declared loading.',
        dayOffset: 21,
      },
      {
        from: 'Dana Whitfield',
        subject: 'Round 2 — interim response',
        body: 'The supplier specification is attached. The laboratory report is still being scheduled with the external laboratory.',
        dayOffset: 44,
      },
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 3 — outcome',
        body: 'Recording the file as More Data Needed. Please resubmit once the laboratory report is available, or with an alternative preservative system.',
        dayOffset: 68,
      },
    ],
  },
  {
    id: 'SUB-2304',
    formulaId: 'FML-1007',
    version: 'v4.8',
    outcome: 'AP',
    reviewRounds: 1,
    feedbackTheme: 'Wax grade confirmation',
    submittedDaysAgo: 505,
    closedDaysAgo: 478,
    adjust: { 'RM-113': 60, 'RM-106': 2.1 },
    requestedChanges: ['Confirm the refined wax grade against the supplier specification.'],
    findings: [
      {
        severity: 'low',
        title: 'Wax grade reference required confirmation',
        detail: 'Resolved in the same round with the supplier specification.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — clarification',
        body: 'Please confirm the refined wax grade matches the supplier specification referenced in the composition sheet.',
        dayOffset: 11,
      },
    ],
  },
  {
    id: 'SUB-2305',
    formulaId: 'FML-1009',
    version: 'v2.4',
    outcome: 'AP',
    reviewRounds: 2,
    feedbackTheme: 'Adhesive residue testing',
    submittedDaysAgo: 430,
    closedDaysAgo: 380,
    adjust: { 'RM-124': 24, 'RM-102': 6 },
    requestedChanges: [
      'Provide residue data after wash-out on fabric substrates.',
      'Record the thickener level on the composition sheet.',
    ],
    findings: [
      {
        severity: 'low',
        title: 'Residue behaviour after wash-out not documented',
        detail: 'Closed once the internal residue study was supplied.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — information request',
        body: 'Please provide residue data after wash-out on fabric substrates, and record the thickener level on the composition sheet.',
        dayOffset: 16,
      },
      {
        from: 'Dana Whitfield',
        subject: 'Round 1 — response',
        body: 'Residue study attached. The composition sheet has been updated with the thickener level.',
        dayOffset: 31,
      },
    ],
  },
  {
    id: 'SUB-2306',
    formulaId: 'FML-1002',
    version: 'v1.0',
    outcome: 'CL',
    reviewRounds: 2,
    feedbackTheme: 'Surfactant labelling',
    submittedDaysAgo: 360,
    closedDaysAgo: 312,
    adjust: { 'RM-104': 8.4, 'RM-109': 1.8 },
    requestedChanges: [
      'Add cautionary labelling covering the surfactant level.',
      'Provide the colorant certificate of analysis.',
    ],
    findings: [
      {
        severity: 'medium',
        title: 'Surfactant level prompted cautionary labelling',
        detail: 'Recorded outcome was acceptance with cautionary labelling.',
      },
      {
        severity: 'medium',
        title: 'Colorant certificate of analysis was outstanding',
        detail: 'The certificate is still absent from the current demo workspace.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — information request',
        body: 'Please provide the certificate of analysis for the magenta dispersion and confirm the surfactant level in the finished ink.',
        dayOffset: 19,
      },
      {
        from: 'Elena Barros',
        subject: 'Round 2 — response',
        body: 'The surfactant level is confirmed. The certificate of analysis has been requested from the supplier and is not yet available.',
        dayOffset: 38,
      },
    ],
  },
  {
    id: 'SUB-2307',
    formulaId: 'FML-1004',
    version: 'v1.0',
    outcome: 'More Data Needed',
    reviewRounds: 3,
    feedbackTheme: 'Colorant certificates',
    submittedDaysAgo: 300,
    closedDaysAgo: 236,
    adjust: { 'RM-104': 9.5, 'RM-108': 17 },
    requestedChanges: [
      'Provide certificates of analysis for every colorant in the composition.',
      'Confirm the filler grade.',
    ],
    findings: [
      {
        severity: 'high',
        title: 'Colorant certificates were not supplied',
        detail: 'The file closed with additional data requested.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — data request',
        body: 'Certificates of analysis are required for every colorant in the composition before the file can progress.',
        dayOffset: 22,
      },
      {
        from: 'Theo Kowalski',
        subject: 'Round 2 — interim response',
        body: 'Two of three certificates are attached. The magenta dispersion certificate is outstanding with the supplier.',
        dayOffset: 41,
      },
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 3 — outcome',
        body: 'Recording the file as More Data Needed pending the outstanding colorant certificate.',
        dayOffset: 60,
      },
    ],
  },
  {
    id: 'SUB-2308',
    formulaId: 'FML-1013',
    version: 'v1.9',
    outcome: 'AP',
    reviewRounds: 1,
    feedbackTheme: 'Starch source documentation',
    submittedDaysAgo: 255,
    closedDaysAgo: 228,
    adjust: { 'RM-116': 30, 'RM-119': 9 },
    requestedChanges: ['Record the starch source and grade on the composition sheet.'],
    findings: [
      {
        severity: 'low',
        title: 'Starch source not recorded',
        detail: 'Resolved in the same round.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — clarification',
        body: 'Please record the starch source and grade on the composition sheet.',
        dayOffset: 12,
      },
    ],
  },
  {
    id: 'SUB-2309',
    formulaId: 'FML-1008',
    version: 'v1.7',
    outcome: 'CL',
    reviewRounds: 2,
    feedbackTheme: 'Metallic pigment disclosure',
    submittedDaysAgo: 200,
    closedDaysAgo: 158,
    adjust: { 'RM-104': 4.2, 'RM-125': 3.4 },
    requestedChanges: [
      'Disclose the full metallic pigment set.',
      'Add cautionary labelling for the intended age group.',
    ],
    findings: [
      {
        severity: 'medium',
        title: 'Metallic pigment set was partially disclosed',
        detail: 'Recorded outcome was acceptance with cautionary labelling.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — information request',
        body: 'The metallic pigment set appears partially disclosed. Please provide the full composition and confirm the intended age group.',
        dayOffset: 17,
      },
      {
        from: 'Dana Whitfield',
        subject: 'Round 2 — response',
        body: 'Full pigment set provided. The age group is confirmed as 6+ and cautionary labelling has been drafted.',
        dayOffset: 35,
      },
    ],
  },
  {
    id: 'SUB-2310',
    formulaId: 'FML-1017',
    version: 'v2.0',
    outcome: 'AP',
    reviewRounds: 1,
    feedbackTheme: 'Skin-contact duration',
    submittedDaysAgo: 150,
    closedDaysAgo: 123,
    adjust: { 'RM-107': 16, 'RM-125': 5 },
    requestedChanges: ['Document the expected skin-contact duration for a supervised session.'],
    findings: [
      {
        severity: 'low',
        title: 'Skin-contact duration not documented',
        detail: 'Resolved with the internal contact-duration study.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — clarification',
        body: 'Please document the expected skin-contact duration for a supervised craft session.',
        dayOffset: 13,
      },
    ],
  },
  {
    id: 'SUB-2311',
    formulaId: 'FML-1010',
    version: 'v1.2',
    outcome: 'More Data Needed',
    reviewRounds: 2,
    feedbackTheme: 'Thickener documentation',
    submittedDaysAgo: 105,
    closedDaysAgo: 62,
    adjust: { 'RM-115': 3.8, 'RM-124': 22 },
    requestedChanges: [
      'Provide the thickener specification and supplier document set.',
      'Confirm the surfactant document set is current.',
    ],
    findings: [
      {
        severity: 'medium',
        title: 'Surfactant document set was superseded',
        detail: 'The superseded safety data sheet is still on file in the current demo workspace.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — data request',
        body: 'Please provide the thickener specification, and confirm that the surfactant safety data sheet on file is the current revision.',
        dayOffset: 15,
      },
      {
        from: 'Elena Barros',
        subject: 'Round 2 — interim response',
        body: 'Thickener specification attached. The surfactant revision is still being chased with the supplier.',
        dayOffset: 33,
      },
    ],
  },
  {
    id: 'SUB-2312',
    formulaId: 'FML-1015',
    version: 'v1.0',
    outcome: 'CL',
    reviewRounds: 3,
    feedbackTheme: 'Defoamer loading',
    submittedDaysAgo: 70,
    closedDaysAgo: 24,
    adjust: { 'RM-122': 0.4, 'RM-124': 20 },
    requestedChanges: [
      'Justify the defoamer loading in the finished product.',
      'Add cautionary labelling for the intended age group.',
    ],
    findings: [
      {
        severity: 'medium',
        title: 'Defoamer loading queried',
        detail:
          'The historical record carried a lower defoamer level than the current formula version.',
      },
    ],
    correspondence: [
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 1 — information request',
        body: 'Please justify the defoamer loading in the finished product and confirm the intended age group.',
        dayOffset: 14,
      },
      {
        from: 'Dana Whitfield',
        subject: 'Round 2 — response',
        body: 'Defoamer rationale attached. The age group is confirmed as 6+.',
        dayOffset: 28,
      },
      {
        from: 'Review panel (synthetic)',
        subject: 'Round 3 — outcome',
        body: 'Recorded as acceptance with cautionary labelling. Any increase in the defoamer level would require a fresh assessment.',
        dayOffset: 44,
      },
    ],
  },
];

/* ---------------------------------------------------------- builders */

function buildIngredients(seed: FormulaSeed): Ingredient[] {
  const restTotal = seed.rest.reduce((sum, item) => sum + item.concentration, 0);
  const carrierConcentration = Math.round((100 - restTotal) * 1000) / 1000;
  const rows: IngredientSeed[] = [
    { name: seed.carrier.name, rawMaterialId: seed.carrier.rawMaterialId, concentration: carrierConcentration },
    ...seed.rest,
  ];
  return rows.map((row, index) => ({
    id: `${seed.id}-ING-${String(index + 1).padStart(2, '0')}`,
    name: row.name,
    rawMaterialId: row.rawMaterialId,
    concentration: row.concentration,
    supplier: row.rawMaterialId
      ? MATERIAL_SEEDS.find((material) => material.id === row.rawMaterialId)?.supplier
      : undefined,
    evidenceIds: [],
    addedInVersion: row.addedInVersion,
    notes: row.notes,
  }));
}

function buildPreviousComposition(seed: FormulaSeed) {
  if (!seed.previousComposition) return undefined;
  const restTotal = seed.previousComposition.reduce((sum, item) => sum + item.concentration, 0);
  const carrierConcentration = Math.round((100 - restTotal) * 1000) / 1000;
  return [
    {
      name: seed.carrier.name,
      rawMaterialId: seed.carrier.rawMaterialId,
      concentration: carrierConcentration,
    },
    ...seed.previousComposition.map((item) => ({
      name: item.name,
      rawMaterialId: item.rawMaterialId,
      concentration: item.concentration,
    })),
  ];
}

export function createSeedDataset(): DemoDataset {
  const base = startOfToday();
  const documents: EvidenceDocument[] = [];

  /* Raw materials and their supplier documents. */
  const rawMaterials: RawMaterial[] = MATERIAL_SEEDS.map((seed) => {
    const documentIds: string[] = [];
    const numeric = seed.id.replace('RM-', '');

    const addDocument = (
      type: EvidenceDocument['type'],
      status: DocPlan | undefined,
      suffix: string,
      issuedDaysAgo: number,
      summary: string,
    ) => {
      if (!status || status === 'none') return;
      const id = `DOC-${suffix}-${numeric}`;
      documents.push({
        id,
        title: `${type} — ${seed.name}`,
        type,
        status,
        issuedDate: shiftDays(base, -issuedDaysAgo, 10),
        supplier: seed.supplier,
        rawMaterialId: seed.id,
        summary,
      });
      documentIds.push(id);
    };

    addDocument(
      'SDS',
      seed.sds,
      'SDS',
      seed.sds === 'outdated' ? 760 : 260,
      `Synthetic safety data sheet for ${seed.name} as supplied by ${seed.supplier}. Handling, storage and transport sections are illustrative.`,
    );
    addDocument(
      'Certificate of Analysis',
      seed.coa,
      'COA',
      180,
      `Synthetic batch certificate for ${seed.name}, recording illustrative assay, appearance and moisture results.`,
    );
    addDocument(
      'Laboratory Report',
      seed.labReport,
      'LAB',
      140,
      `Synthetic laboratory report covering ${seed.name} under the demo workspace testing programme.`,
    );

    return {
      id: seed.id,
      name: seed.name,
      supplier: seed.supplier,
      role: seed.role,
      documentIds,
      demoConcentrationCeiling: seed.ceiling,
      requiresExpertAssessment: seed.expert,
      requiresLabReport: seed.lab,
      summary: seed.summary,
      usageNote: seed.usageNote,
    } satisfies RawMaterial;
  });

  /* Formulas and their formula-level documents. */
  const formulas: Formula[] = FORMULA_SEEDS.map((seed) => {
    const evidenceIds: string[] = [];
    seed.formulaDocuments?.forEach((document, index) => {
      const id = `DOC-FRM-${seed.id.replace('FML-', '')}-${String(index + 1).padStart(2, '0')}`;
      documents.push({
        id,
        title: document.title,
        type: document.type,
        status: 'available',
        issuedDate: shiftDays(base, -(seed.updatedDaysAgo + 6), 11),
        formulaId: seed.id,
        summary: document.summary,
      });
      evidenceIds.push(id);
    });

    const mappedAge = mapLegacyAge(seed.ageGroup);
    return {
      id: seed.id,
      name: seed.name,
      version: seed.version,
      category: seed.category,
      ageGroup: mappedAge.ageGroup ?? 'under_12',
      recordedAgeGroup: mappedAge.recordedAgeGroup,
      ageGroupNeedsSelection: mappedAge.needsSelection,
      targetMarkets: ['US'],
      physicalForm: seed.physicalForm,
      intendedUse: seed.intendedUse,
      ownerId: seed.ownerId,
      reviewerId: seed.reviewerId,
      lifecycle: seed.lifecycle,
      ingredients: buildIngredients(seed),
      evidenceIds,
      screeningStatus: 'not-screened',
      screeningCurrent: false,
      reviewStatus: seed.reviewStatus,
      createdAt: shiftDays(base, -seed.createdDaysAgo, 9, 15),
      updatedAt: shiftDays(base, -seed.updatedDaysAgo, 14, 30),
      nextReviewDate: seed.reviewDueInDays ? shiftDays(base, seed.reviewDueInDays, 9) : undefined,
      description: seed.description,
    } satisfies Formula;
  });

  /* Historical submissions derived from the current compositions. */
  const submissions: Submission[] = SUBMISSION_SEEDS.map((seed) => {
    const formula = formulas.find((item) => item.id === seed.formulaId);
    const category = formula?.category ?? 'Markers';
    const snapshotRows: SubmissionSnapshotIngredient[] = (formula?.ingredients ?? [])
      .filter((ingredient) => !seed.drop?.includes(ingredient.rawMaterialId ?? ''))
      .map((ingredient) => ({
        name: ingredient.name,
        rawMaterialId: ingredient.rawMaterialId,
        concentration:
          ingredient.rawMaterialId && seed.adjust?.[ingredient.rawMaterialId] !== undefined
            ? (seed.adjust[ingredient.rawMaterialId] as number)
            : ingredient.concentration,
      }));
    seed.add?.forEach((extra) => snapshotRows.push({ ...extra }));

    // Re-balance the historical snapshot onto the carrier so it still totals 100%.
    if (snapshotRows.length > 0) {
      const tail = snapshotRows.slice(1).reduce((sum, row) => sum + row.concentration, 0);
      const head = snapshotRows[0];
      if (head) head.concentration = Math.round((100 - tail) * 1000) / 1000;
    }

    const submittedAt = shiftDays(base, -seed.submittedDaysAgo, 10);
    const closedAt = shiftDays(base, -seed.closedDaysAgo, 16);

    return {
      id: seed.id,
      formulaId: seed.formulaId,
      formulaName: formula?.name ?? seed.formulaId,
      version: seed.version,
      category,
      submittedAt,
      closedAt,
      outcome: seed.outcome,
      reviewRounds: seed.reviewRounds,
      feedbackTheme: seed.feedbackTheme,
      snapshot: snapshotRows,
      timeline: [
        { date: submittedAt, label: 'Submitted', detail: `${formula?.name ?? seed.formulaId} ${seed.version} sent for review.` },
        {
          date: shiftDays(base, -(seed.submittedDaysAgo - 7), 11),
          label: 'Acknowledged',
          detail: 'Synthetic acknowledgement recorded in the demo history.',
        },
        ...seed.correspondence.map((entry) => ({
          date: shiftDays(base, -(seed.submittedDaysAgo - entry.dayOffset), 12),
          label: entry.subject,
          detail: `${entry.from}: ${entry.subject}`,
        })),
        {
          date: closedAt,
          label: `Outcome recorded — ${seed.outcome}`,
          detail: `Recorded outcome in the synthetic history after ${seed.reviewRounds} review ${
            seed.reviewRounds === 1 ? 'round' : 'rounds'
          }.`,
        },
      ],
      correspondence: seed.correspondence.map((entry, index) => ({
        id: `${seed.id}-MSG-${index + 1}`,
        date: shiftDays(base, -(seed.submittedDaysAgo - entry.dayOffset), 12),
        from: entry.from,
        subject: entry.subject,
        body: entry.body,
      })),
      requestedChanges: seed.requestedChanges,
      evidenceIds: [],
      findings: seed.findings,
    } satisfies Submission;
  });

  /* Correspondence documents linked back to the submissions. */
  submissions.forEach((submission) => {
    submission.correspondence.forEach((message, index) => {
      const id = `DOC-COR-${submission.id.replace('SUB-', '')}-${String(index + 1).padStart(2, '0')}`;
      documents.push({
        id,
        title: `${submission.id} — ${message.subject}`,
        type: 'Correspondence',
        status: 'available',
        issuedDate: message.date,
        formulaId: submission.formulaId,
        submissionId: submission.id,
        summary: message.body,
      });
      submission.evidenceIds.push(id);
    });
  });

  /* Screening runs, produced by the same engine the application uses at runtime. */
  const runs: ScreeningRun[] = [];

  FORMULA_SEEDS.forEach((seed) => {
    if (seed.screenedDaysAgo === undefined) return;
    const formula = formulas.find((item) => item.id === seed.id);
    if (!formula) return;

    const previousComposition = buildPreviousComposition(seed);
    const runVersion = seed.runVersion ?? seed.version;
    const subjectFormula: Formula = previousComposition
      ? {
          ...formula,
          version: runVersion,
          ingredients: previousComposition.map((row, index) => ({
            id: `${formula.id}-PREV-${index}`,
            name: row.name,
            rawMaterialId: row.rawMaterialId,
            concentration: row.concentration,
            evidenceIds: [],
          })),
        }
      : { ...formula, version: runVersion };

    const computation = computeScreening({
      formula: subjectFormula,
      rawMaterials,
      documents,
      submissions,
    });

    const runAt = shiftDays(base, -seed.screenedDaysAgo, 15, 45);
    const run: ScreeningRun = {
      id: `RUN-${seed.id.replace('FML-', '')}-01`,
      formulaId: formula.id,
      formulaName: formula.name,
      formulaVersion: runVersion,
      ageGroup: subjectFormula.ageGroup,
      targetMarkets: subjectFormula.targetMarkets,
      marketResults: computation.marketResults,
      assessmentRequest: {
        target_markets: subjectFormula.targetMarkets,
        age_group: subjectFormula.ageGroup,
      },
      status: computation.status,
      evidenceCompleteness: computation.evidence.completeness,
      requiredEvidenceCount: computation.evidence.requiredCount,
      presentEvidenceCount: computation.evidence.presentCount,
      runAt,
      runBy: seed.reviewerId ?? seed.ownerId,
      summary: computation.summary,
      findings: computation.findings,
      exposureInputs: computation.exposureInputs,
      comparisons: computation.comparisons,
      nextActions: computation.nextActions,
      outdated: true,
      ingredientSnapshot: snapshotIngredients(subjectFormula.ingredients),
      legacySample: true,
      physicalForm: subjectFormula.physicalForm,
      intendedUse: subjectFormula.intendedUse,
      category: subjectFormula.category,
      aiStatus: 'not_requested',
    };
    runs.push(run);

    formula.screeningStatus = computation.status;
    formula.screeningCurrent = false;
    formula.latestRunId = run.id;
    formula.lastScreenedAt = runAt;
  });

  /* A couple of earlier runs so the screening history is not empty. */
  const priorRunSources: { formulaId: string; daysAgo: number }[] = [
    { formulaId: 'FML-1002', daysAgo: 62 },
    { formulaId: 'FML-1005', daysAgo: 88 },
  ];
  priorRunSources.forEach(({ formulaId, daysAgo }) => {
    const latest = runs.find((run) => run.formulaId === formulaId);
    if (!latest) return;
    runs.push({
      ...latest,
      id: `RUN-${formulaId.replace('FML-', '')}-00`,
      runAt: shiftDays(base, -daysAgo, 11, 20),
      outdated: true,
      summary: `${latest.summary} (Superseded by a later run.)`,
    });
  });

  /* Review decisions recorded against the seeded runs. */
  const decisionSeeds: {
    formulaId: string;
    decision: ReviewDecision['decision'];
    note: string;
    daysAgo: number;
    by: string;
  }[] = [
    {
      formulaId: 'FML-1001',
      decision: 'review-complete',
      note: 'Demo checks clear and the full supplier document set is on file. Internal review closed for v3.1.',
      daysAgo: 17,
      by: 'usr-marcus',
    },
    {
      formulaId: 'FML-1002',
      decision: 'request-evidence',
      note: 'Holding review until the magenta certificate of analysis and the revised surfactant safety data sheet arrive.',
      daysAgo: 8,
      by: 'usr-marcus',
    },
    {
      formulaId: 'FML-1003',
      decision: 'review-complete',
      note: 'No open concerns from the demo checks. Opacity study reviewed and accepted internally.',
      daysAgo: 30,
      by: 'usr-priya',
    },
    {
      formulaId: 'FML-1015',
      decision: 'return-for-changes',
      note: 'Defoamer loading is well above the illustrative demo ceiling. Returning to formulation for a revised level.',
      daysAgo: 6,
      by: 'usr-marcus',
    },
    {
      formulaId: 'FML-1009',
      decision: 'review-complete',
      note: 'Internal review complete for v3.0. Scheduled reassessment remains on the monitoring list.',
      daysAgo: 95,
      by: 'usr-marcus',
    },
    {
      formulaId: 'FML-1006',
      decision: 'request-evidence',
      note: 'Blue dye solution has no supplier documents. Requested the full set before the review continues.',
      daysAgo: 5,
      by: 'usr-marcus',
    },
  ];

  const decisions: ReviewDecision[] = decisionSeeds.flatMap((seed, index) => {
    const run = runs.find((item) => item.formulaId === seed.formulaId && item.id.endsWith('-01'));
    if (!run) return [];
    return [
      {
        id: `DEC-${String(index + 1).padStart(3, '0')}`,
        formulaId: seed.formulaId,
        runId: run.id,
        decision: seed.decision,
        note: seed.note,
        decidedById: seed.by,
        decidedAt: shiftDays(base, -seed.daysAgo, 16, 10),
      },
    ];
  });

  /* Monitoring alerts. */
  const alerts: MonitoringAlert[] = [
    {
      id: 'ALR-3001',
      type: 'safety-source-update',
      severity: 'high',
      title: 'Demo safety-source entry updated for Preservative Blend PB-9 (legacy)',
      whatChanged:
        'The illustrative demo safety source added a note recommending specialist assessment for legacy preservative blends used in direct hand-contact products.',
      sourceReference: 'Demo safety source · entry DS-2026-014 (synthetic)',
      matchReason: 'RM-111 is present in the composition of the affected formula at 0.6%.',
      affectedFormulaIds: ['FML-1005'],
      relatedRawMaterialId: 'RM-111',
      suggestedAction: 'Ask a product safety specialist to reassess the preservative system before the next submission.',
      status: 'open',
      createdAt: shiftDays(base, -3, 8, 20),
      dueDate: shiftDays(base, 5, 17),
    },
    {
      id: 'ALR-3002',
      type: 'supplier-document-update',
      severity: 'medium',
      title: 'Marlow Specialty issued a revised document set for Nonionic Surfactant NS-7',
      whatChanged:
        'The supplier replaced the safety data sheet on file. The version in this workspace is marked outdated until the replacement is recorded.',
      sourceReference: 'Supplier portal notice · Marlow Specialty (synthetic)',
      matchReason: 'RM-109 appears in three active formulas.',
      affectedFormulaIds: ['FML-1002', 'FML-1010', 'FML-1016'],
      relatedRawMaterialId: 'RM-109',
      suggestedAction: 'Request the current safety data sheet and replace the outdated record.',
      status: 'open',
      assignedToId: 'usr-marcus',
      createdAt: shiftDays(base, -6, 9, 10),
      dueDate: shiftDays(base, 9, 17),
    },
    {
      id: 'ALR-3003',
      type: 'evidence-gap',
      severity: 'medium',
      title: 'Certificate of analysis missing for Magenta Dispersion Pigment M-21',
      whatChanged:
        'The demo evidence checks still report no certificate of analysis for RM-104, which is required for colorants.',
      sourceReference: 'Internal evidence check (demo rule DR-04)',
      matchReason: 'RM-104 is used in four active formulas and has no certificate on file.',
      affectedFormulaIds: ['FML-1002', 'FML-1004', 'FML-1008', 'FML-1018'],
      relatedRawMaterialId: 'RM-104',
      suggestedAction: 'Request the certificate of analysis from Helix Colour Labs.',
      status: 'open',
      createdAt: shiftDays(base, -11, 10, 5),
      dueDate: shiftDays(base, 4, 17),
    },
    {
      id: 'ALR-3004',
      type: 'scheduled-review',
      severity: 'medium',
      title: 'Scheduled reassessment due for SureBond School Glue',
      whatChanged: 'The scheduled review date recorded for this formula is approaching.',
      sourceReference: 'Internal review schedule',
      matchReason: 'FML-1009 has a recorded review date within the next two weeks.',
      affectedFormulaIds: ['FML-1009'],
      suggestedAction: 'Re-run screening and confirm the supplier document set is still current.',
      status: 'open',
      createdAt: shiftDays(base, -2, 8, 45),
      dueDate: shiftDays(base, 12, 17),
    },
    {
      id: 'ALR-3005',
      type: 'scheduled-review',
      severity: 'low',
      title: 'Scheduled reassessment due for StudioBright Finger Paint',
      whatChanged: 'The scheduled review date recorded for this direct skin-contact formula is approaching.',
      sourceReference: 'Internal review schedule',
      matchReason: 'FML-1017 has a recorded review date within the next month.',
      affectedFormulaIds: ['FML-1017'],
      suggestedAction: 'Re-run screening ahead of the recorded review date.',
      status: 'acknowledged',
      assignedToId: 'usr-priya',
      createdAt: shiftDays(base, -9, 9, 30),
      dueDate: shiftDays(base, 26, 17),
    },
    {
      id: 'ALR-3006',
      type: 'supplier-document-update',
      severity: 'low',
      title: 'Keystone Polymers refreshed the certificate for Acrylic Binder Emulsion AB-30',
      whatChanged: 'A newer batch certificate is available. The record on file remains valid for the current batch.',
      sourceReference: 'Supplier portal notice · Keystone Polymers (synthetic)',
      matchReason: 'RM-107 is used in two active paint formulas.',
      affectedFormulaIds: ['FML-1003', 'FML-1017'],
      relatedRawMaterialId: 'RM-107',
      suggestedAction: 'Record the newer certificate at the next batch changeover.',
      status: 'acknowledged',
      assignedToId: 'usr-elena',
      createdAt: shiftDays(base, -16, 11),
    },
    {
      id: 'ALR-3007',
      type: 'evidence-gap',
      severity: 'medium',
      title: 'No supplier documents on file for Blue Dye Solution B-27',
      whatChanged:
        'RM-123 was introduced in a current formula version and still has no safety data sheet or certificate of analysis.',
      sourceReference: 'Internal evidence check (demo rules DR-04, DR-06)',
      matchReason: 'RM-123 is new in FML-1006 v1.0 and has no available documents.',
      affectedFormulaIds: ['FML-1006'],
      relatedRawMaterialId: 'RM-123',
      suggestedAction: 'Request the full supplier document set from Westfall Pigments.',
      status: 'open',
      createdAt: shiftDays(base, -5, 13, 15),
      dueDate: shiftDays(base, 7, 17),
    },
    {
      id: 'ALR-3008',
      type: 'safety-source-update',
      severity: 'low',
      title: 'Demo safety-source note added for Bittering Agent BA-5',
      whatChanged:
        'The illustrative demo safety source added a note about recording trace additive levels on the composition sheet.',
      sourceReference: 'Demo safety source · entry DS-2026-009 (synthetic)',
      matchReason: 'RM-121 is present at trace levels in three formulas.',
      affectedFormulaIds: ['FML-1001', 'FML-1011', 'FML-1017'],
      relatedRawMaterialId: 'RM-121',
      suggestedAction: 'Confirm the trace level is recorded on each composition sheet.',
      status: 'resolved',
      assignedToId: 'usr-priya',
      createdAt: shiftDays(base, -34, 10),
      resolutionNote: 'Trace levels confirmed on all three composition sheets. No further action required.',
    },
  ];

  /* Activity feed. */
  const activities: ActivityEvent[] = [];
  let activityCounter = 0;
  const addActivity = (event: Omit<ActivityEvent, 'id'>) => {
    activityCounter += 1;
    activities.push({ ...event, id: `ACT-${String(activityCounter).padStart(4, '0')}` });
  };

  formulas.forEach((formula) => {
    addActivity({
      type: 'formula-created',
      actorId: formula.ownerId,
      at: formula.createdAt,
      summary: `${formula.name} created`,
      detail: `Initial record added for ${formula.category.toLowerCase()}.`,
      formulaId: formula.id,
    });
  });

  runs
    .filter((run) => run.id.endsWith('-01'))
    .forEach((run) => {
      addActivity({
        type: 'screening-run',
        actorId: run.runBy,
        at: run.runAt,
        summary: `Screening run completed for ${run.formulaName} ${run.formulaVersion}`,
        detail: `Result: ${run.status.toUpperCase()} · evidence completeness ${run.evidenceCompleteness}%.`,
        formulaId: run.formulaId,
        runId: run.id,
      });
    });

  decisions.forEach((decision) => {
    const formula = formulas.find((item) => item.id === decision.formulaId);
    addActivity({
      type: 'review-decision',
      actorId: decision.decidedById,
      at: decision.decidedAt,
      summary: `Review decision recorded for ${formula?.name ?? decision.formulaId}`,
      detail: decision.note,
      formulaId: decision.formulaId,
      runId: decision.runId,
    });
  });

  addActivity({
    type: 'formula-updated',
    actorId: 'usr-dana',
    at: shiftDays(base, -2, 14, 30),
    summary: 'ColorFlow Fine Line Marker updated to v2.2',
    detail: 'Cyan dispersion raised from 7.8% to 9.4%. The previous screening result is now outdated.',
    formulaId: 'FML-1011',
  });

  addActivity({
    type: 'alert-updated',
    actorId: 'usr-priya',
    at: shiftDays(base, -30, 15),
    summary: 'Monitoring alert resolved — Bittering Agent BA-5',
    detail: 'Trace levels confirmed on all three composition sheets.',
    alertId: 'ALR-3008',
  });

  alerts
    .filter((alert) => alert.status === 'open')
    .slice(0, 4)
    .forEach((alert) => {
      addActivity({
        type: 'alert-updated',
        actorId: 'usr-marcus',
        at: alert.createdAt,
        summary: `Monitoring alert raised — ${alert.title}`,
        detail: alert.matchReason,
        alertId: alert.id,
      });
    });

  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    people: PEOPLE,
    formulas,
    rawMaterials,
    documents,
    submissions,
    alerts,
    runs,
    decisions,
    activities,
    settings: {
      currentUserId: 'usr-dana',
      defaultReviewerId: 'usr-marcus',
      tableDensity: 'comfortable',
    },
    sourceReviewDrafts: [],
  };
}

/** Sample composition offered by the "Load sample formula" control in the new-formula flow. */
export const SAMPLE_FORMULA = {
  name: 'ColorFlow Brush Marker',
  category: 'Markers' as ProductCategory,
  ageGroup: 'under_12' as AgeGroup,
  targetMarkets: ['US'] as const,
  physicalForm: 'Liquid' as PhysicalForm,
  intendedUse: 'Brush-tip marker for lettering and illustration on paper and card.',
  ingredients: [
    { name: 'Aqua Base Concentrate', rawMaterialId: 'RM-101', concentration: 69.2 },
    { name: 'Polyol Humectant HX-2', rawMaterialId: 'RM-102', concentration: 17.5 },
    { name: 'Cyan Dispersion Pigment C-14', rawMaterialId: 'RM-103', concentration: 8.4 },
    { name: 'Cellulose Thickener T-12', rawMaterialId: 'RM-115', concentration: 3.5 },
    { name: 'Preservative Blend PB-3', rawMaterialId: 'RM-110', concentration: 0.95 },
    { name: 'Citric Acid pH Adjuster PA-8', rawMaterialId: 'RM-120', concentration: 0.45 },
  ],
};
