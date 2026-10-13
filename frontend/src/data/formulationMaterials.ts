import type { ProductCategory } from '../types/domain';

/**
 * Public identities for substances commonly used in art materials.
 * This is a selection list, not a Crayola recipe and not an approved formula.
 */
export interface FormulationMaterial {
  id: string;
  name: string;
  casNumber: string | null;
  materialType: string;
  categories: ProductCategory[];
}

export interface SubstanceChoice {
  id: string;
  name: string;
  casNumber: string | null;
  materialType: string;
  role: string;
}

interface CatalogMatch {
  substance_id: string;
  label: string;
  cas_number?: string | null;
  role: string;
  composition_types: string[];
}

const ALL: ProductCategory[] = [];
const CRAYONS: ProductCategory[] = ['Crayons'];
const MARKERS: ProductCategory[] = ['Markers'];
const PAINTS: ProductCategory[] = ['Paints'];
const MODELING: ProductCategory[] = ['Modeling Compounds'];
const WATERBASED: ProductCategory[] = ['Markers', 'Paints', 'Modeling Compounds'];

export const FORMULATION_MATERIALS: FormulationMaterial[] = [
  { id: 'water', name: 'Water', casNumber: '7732-18-5', materialType: 'Solvents', categories: ALL },
  { id: 'glycerin', name: 'Glycerin', casNumber: '56-81-5', materialType: 'Additives', categories: ALL },
  { id: 'propylene_glycol', name: 'Propylene glycol', casNumber: '57-55-6', materialType: 'Solvents', categories: ALL },
  { id: 'calcium_carbonate', name: 'Calcium carbonate', casNumber: '471-34-1', materialType: 'Fillers', categories: ALL },
  { id: 'kaolin', name: 'Kaolin', casNumber: '1332-58-7', materialType: 'Fillers', categories: ALL },
  { id: 'talc', name: 'Talc', casNumber: '14807-96-6', materialType: 'Fillers', categories: ALL },
  { id: 'hydrated_silica', name: 'Hydrated silica', casNumber: '112926-00-8', materialType: 'Fillers', categories: ALL },
  { id: 'titanium_dioxide', name: 'Titanium dioxide', casNumber: '13463-67-7', materialType: 'Pigments', categories: ALL },
  { id: 'iron_oxide_red', name: 'Iron oxide, red', casNumber: '1309-37-1', materialType: 'Pigments', categories: ALL },
  { id: 'carbon_black', name: 'Carbon black', casNumber: '1333-86-4', materialType: 'Pigments', categories: ALL },
  { id: 'ultramarine_blue', name: 'Ultramarine blue', casNumber: '57455-37-5', materialType: 'Pigments', categories: ALL },
  { id: 'mica', name: 'Mica', casNumber: '12001-26-2', materialType: 'Pigments', categories: ALL },
  { id: 'zinc_oxide', name: 'Zinc oxide', casNumber: '1314-13-2', materialType: 'Pigments', categories: ALL },

  { id: 'paraffin_wax', name: 'Paraffin wax', casNumber: '8002-74-2', materialType: 'Waxes', categories: CRAYONS },
  { id: 'microcrystalline_wax', name: 'Microcrystalline wax', casNumber: '63231-60-7', materialType: 'Waxes', categories: CRAYONS },
  { id: 'polyethylene_wax', name: 'Polyethylene wax', casNumber: '9002-88-4', materialType: 'Waxes', categories: CRAYONS },
  { id: 'carnauba_wax', name: 'Carnauba wax', casNumber: '8015-86-9', materialType: 'Waxes', categories: CRAYONS },
  { id: 'beeswax', name: 'Beeswax', casNumber: '8012-89-3', materialType: 'Waxes', categories: CRAYONS },
  { id: 'stearic_acid', name: 'Stearic acid', casNumber: '57-11-4', materialType: 'Additives', categories: CRAYONS },
  { id: 'calcium_stearate', name: 'Calcium stearate', casNumber: '1592-23-0', materialType: 'Additives', categories: CRAYONS },

  { id: 'ethanol', name: 'Ethanol', casNumber: '64-17-5', materialType: 'Solvents', categories: MARKERS },
  { id: 'diethylene_glycol', name: 'Diethylene glycol', casNumber: '111-46-6', materialType: 'Solvents', categories: MARKERS },
  { id: 'ethyl_lactate', name: 'Ethyl lactate', casNumber: '97-64-3', materialType: 'Solvents', categories: MARKERS },
  { id: 'polyethylene_glycol', name: 'Polyethylene glycol', casNumber: '25322-68-3', materialType: 'Solvents', categories: MARKERS },
  { id: 'triethanolamine', name: 'Triethanolamine', casNumber: '102-71-6', materialType: 'Additives', categories: MARKERS },
  { id: 'acid_blue_9', name: 'Acid Blue 9', casNumber: '3844-45-9', materialType: 'Dyes', categories: MARKERS },
  { id: 'acid_yellow_23', name: 'Acid Yellow 23', casNumber: '1934-21-0', materialType: 'Dyes', categories: MARKERS },
  { id: 'allura_red', name: 'Allura Red AC', casNumber: '25956-17-6', materialType: 'Dyes', categories: MARKERS },
  { id: 'acid_red_52', name: 'Acid Red 52', casNumber: '3520-42-1', materialType: 'Dyes', categories: MARKERS },

  { id: 'acrylic_copolymer', name: 'Acrylic copolymer binder', casNumber: null, materialType: 'Additives', categories: PAINTS },
  { id: 'polyvinyl_acetate', name: 'Polyvinyl acetate', casNumber: '9003-20-7', materialType: 'Additives', categories: PAINTS },
  { id: 'polyvinyl_alcohol', name: 'Polyvinyl alcohol', casNumber: '9002-89-5', materialType: 'Additives', categories: [...PAINTS, ...MODELING] },
  { id: 'gum_arabic', name: 'Gum arabic', casNumber: '9000-01-5', materialType: 'Additives', categories: PAINTS },
  { id: 'bismuth_vanadate', name: 'Bismuth vanadate', casNumber: '14059-33-7', materialType: 'Pigments', categories: PAINTS },

  { id: 'carboxymethyl_cellulose', name: 'Carboxymethyl cellulose', casNumber: '9004-32-4', materialType: 'Additives', categories: WATERBASED },
  { id: 'xanthan_gum', name: 'Xanthan gum', casNumber: '11138-66-2', materialType: 'Additives', categories: WATERBASED },
  { id: 'dextrin', name: 'Dextrin', casNumber: '9004-53-9', materialType: 'Additives', categories: WATERBASED },
  { id: 'phenoxyethanol', name: 'Phenoxyethanol', casNumber: '122-99-6', materialType: 'Preservatives', categories: WATERBASED },
  { id: 'sodium_benzoate', name: 'Sodium benzoate', casNumber: '532-32-1', materialType: 'Preservatives', categories: WATERBASED },
  { id: 'potassium_sorbate', name: 'Potassium sorbate', casNumber: '24634-61-5', materialType: 'Preservatives', categories: WATERBASED },

  { id: 'wheat_flour', name: 'Wheat flour', casNumber: null, materialType: 'Fillers', categories: MODELING },
  { id: 'corn_starch', name: 'Corn starch', casNumber: '9005-25-8', materialType: 'Fillers', categories: MODELING },
  { id: 'sodium_chloride', name: 'Sodium chloride', casNumber: '7647-14-5', materialType: 'Additives', categories: MODELING },
  { id: 'white_mineral_oil', name: 'White mineral oil', casNumber: '8042-47-5', materialType: 'Plasticizers', categories: MODELING },
  { id: 'petrolatum', name: 'Petrolatum', casNumber: '8009-03-8', materialType: 'Plasticizers', categories: MODELING },
  { id: 'calcium_sulfate', name: 'Calcium sulfate', casNumber: '7778-18-9', materialType: 'Fillers', categories: MODELING },
];

const BY_ID = new Map(FORMULATION_MATERIALS.map((item) => [item.id, item]));

export function formulationMaterial(id: string) {
  return BY_ID.get(id);
}

function visibleForCategory(item: FormulationMaterial, category: string) {
  if (!category || category === 'Future / Novelty Products') return true;
  if (item.categories.length === 0) return true;
  return item.categories.includes(category as ProductCategory);
}

function catalogName(label: string) {
  const split = label.split(' — ');
  return split[0]?.trim() || label;
}

export function formulationChoices(category: string, catalog: CatalogMatch[] = []): SubstanceChoice[] {
  const byCas = new Map(
    catalog
      .filter((item) => item.cas_number)
      .map((item) => [item.cas_number as string, item]),
  );
  const used = new Set<string>();
  const choices: SubstanceChoice[] = FORMULATION_MATERIALS.filter((item) => visibleForCategory(item, category)).map((item) => {
    const match = item.casNumber ? byCas.get(item.casNumber) : undefined;
    if (match) used.add(match.substance_id);
    return {
      id: match?.substance_id ?? item.id,
      name: item.name,
      casNumber: item.casNumber,
      materialType: match?.composition_types[0] || item.materialType,
      role: match?.role || 'formulation_ingredient',
    };
  });

  for (const item of catalog) {
    if (item.role === 'contaminant_analyte' || used.has(item.substance_id)) continue;
    if (item.role !== 'formulation_ingredient' && item.role !== 'role_requires_review') continue;
    choices.push({
      id: item.substance_id,
      name: catalogName(item.label),
      casNumber: item.cas_number ?? null,
      materialType: item.composition_types[0] || 'Additives',
      role: item.role,
    });
  }

  choices.sort((left, right) => left.materialType.localeCompare(right.materialType) || left.name.localeCompare(right.name));
  return choices;
}

export function choiceForId(id: string, choices: SubstanceChoice[]) {
  return choices.find((item) => item.id === id) ?? null;
}
