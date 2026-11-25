import type { FurnitureKind, RoomFinishes, RoomType } from './types';

export interface CatalogItem {
  id: string;
  name: string;
  kind: FurnitureKind;
  w: number;
  d: number;
  h: number;
  color: string;
  group: string;
  // where the figure comes from, shown in the UI so a person knows it is a typical size
  note?: string;
}

// Typical retail sizes (mm). These are catalogue defaults, editable per item;
// they are not measurements of any real piece of furniture.
export const FURNITURE: CatalogItem[] = [
  { id: 'bed-king-us', name: 'King bed (US)', kind: 'bed', w: 1930, d: 2030, h: 600, color: '#d9d2c5', group: 'Beds', note: 'US mattress 76 × 80 in' },
  { id: 'bed-cal-king', name: 'California king', kind: 'bed', w: 1830, d: 2130, h: 600, color: '#d9d2c5', group: 'Beds', note: '72 × 84 in' },
  { id: 'bed-queen-us', name: 'Queen bed (US)', kind: 'bed', w: 1520, d: 2030, h: 600, color: '#d9d2c5', group: 'Beds', note: '60 × 80 in' },
  { id: 'bed-king-au', name: 'King bed (AU/NZ)', kind: 'bed', w: 1830, d: 2030, h: 600, color: '#d9d2c5', group: 'Beds', note: 'Mattress 183 × 203 cm' },
  { id: 'bed-queen-au', name: 'Queen bed (AU/NZ)', kind: 'bed', w: 1530, d: 2030, h: 600, color: '#d9d2c5', group: 'Beds', note: '153 × 203 cm' },
  { id: 'bed-king-uk', name: 'King bed (UK)', kind: 'bed', w: 1500, d: 2000, h: 600, color: '#d9d2c5', group: 'Beds', note: '150 × 200 cm' },
  { id: 'bed-double', name: 'Double bed', kind: 'bed', w: 1370, d: 1900, h: 600, color: '#d9d2c5', group: 'Beds' },
  { id: 'bed-single', name: 'Single bed', kind: 'bed', w: 920, d: 1880, h: 550, color: '#d9d2c5', group: 'Beds' },
  { id: 'sofa-3', name: '3-seat sofa', kind: 'sofa', w: 2100, d: 900, h: 850, color: '#6b6f78', group: 'Seating' },
  { id: 'sofa-2', name: '2-seat sofa', kind: 'sofa', w: 1600, d: 880, h: 850, color: '#6b6f78', group: 'Seating' },
  { id: 'sofa-l', name: 'Corner sofa (one side)', kind: 'sofa', w: 2700, d: 950, h: 850, color: '#6b6f78', group: 'Seating' },
  { id: 'armchair', name: 'Armchair', kind: 'chair', w: 850, d: 850, h: 900, color: '#8a7f72', group: 'Seating' },
  { id: 'chair-dining', name: 'Dining chair', kind: 'chair', w: 450, d: 520, h: 900, color: '#8a7f72', group: 'Seating' },
  { id: 'table-dining-6', name: 'Dining table (6)', kind: 'table', w: 1800, d: 900, h: 750, color: '#8b6b4a', group: 'Tables' },
  { id: 'table-dining-4', name: 'Dining table (4)', kind: 'table', w: 1200, d: 800, h: 750, color: '#8b6b4a', group: 'Tables' },
  { id: 'table-coffee', name: 'Coffee table', kind: 'table', w: 1200, d: 600, h: 420, color: '#8b6b4a', group: 'Tables' },
  { id: 'table-side', name: 'Bedside table', kind: 'table', w: 500, d: 400, h: 550, color: '#8b6b4a', group: 'Tables' },
  { id: 'desk', name: 'Desk', kind: 'desk', w: 1400, d: 700, h: 750, color: '#8b6b4a', group: 'Tables' },
  { id: 'wardrobe', name: 'Wardrobe', kind: 'storage', w: 1800, d: 600, h: 2100, color: '#c9c3b8', group: 'Storage' },
  { id: 'dresser', name: 'Chest of drawers', kind: 'storage', w: 1200, d: 500, h: 850, color: '#c9c3b8', group: 'Storage' },
  { id: 'bookcase', name: 'Bookcase', kind: 'storage', w: 900, d: 350, h: 1900, color: '#c9c3b8', group: 'Storage' },
  { id: 'tv-unit', name: 'TV unit', kind: 'cabinet', w: 1800, d: 450, h: 500, color: '#3d3a36', group: 'Storage' },
  { id: 'cab-base', name: 'Kitchen base cabinet 600', kind: 'cabinet', w: 600, d: 600, h: 900, color: '#e8e4dc', group: 'Kitchen' },
  { id: 'cab-base-900', name: 'Kitchen base cabinet 900', kind: 'cabinet', w: 900, d: 600, h: 900, color: '#e8e4dc', group: 'Kitchen' },
  { id: 'island', name: 'Kitchen island', kind: 'cabinet', w: 2400, d: 1000, h: 900, color: '#e8e4dc', group: 'Kitchen' },
  { id: 'fridge', name: 'Fridge', kind: 'appliance', w: 900, d: 750, h: 1800, color: '#b8bcc2', group: 'Appliances' },
  { id: 'range', name: 'Oven / range', kind: 'appliance', w: 600, d: 600, h: 900, color: '#2c2d30', group: 'Appliances' },
  { id: 'dishwasher', name: 'Dishwasher', kind: 'appliance', w: 600, d: 600, h: 850, color: '#b8bcc2', group: 'Appliances' },
  { id: 'washer', name: 'Washing machine', kind: 'appliance', w: 600, d: 650, h: 850, color: '#eceff1', group: 'Appliances' },
  { id: 'dryer', name: 'Dryer', kind: 'appliance', w: 600, d: 650, h: 850, color: '#eceff1', group: 'Appliances' },
  { id: 'tv-65', name: 'TV 65″', kind: 'tv', w: 1450, d: 80, h: 840, color: '#111111', group: 'Appliances' },
  { id: 'bath', name: 'Bathtub', kind: 'bath', w: 1700, d: 750, h: 550, color: '#f4f4f2', group: 'Bathroom' },
  { id: 'shower', name: 'Shower 900', kind: 'shower', w: 900, d: 900, h: 2000, color: '#cfe3ea', group: 'Bathroom' },
  { id: 'toilet', name: 'Toilet', kind: 'toilet', w: 380, d: 700, h: 780, color: '#f4f4f2', group: 'Bathroom' },
  { id: 'vanity', name: 'Vanity 900', kind: 'vanity', w: 900, d: 480, h: 850, color: '#e8e4dc', group: 'Bathroom' },
  { id: 'rug-large', name: 'Rug 2.4 × 1.7', kind: 'rug', w: 2400, d: 1700, h: 10, color: '#9c8f7a', group: 'Decor' },
  { id: 'plant', name: 'Floor plant', kind: 'plant', w: 500, d: 500, h: 1400, color: '#4f6b4a', group: 'Decor' },
  { id: 'lamp-floor', name: 'Floor lamp', kind: 'lamp', w: 400, d: 400, h: 1600, color: '#c8a96a', group: 'Decor' },
];

export const catalogById = (id: string) => FURNITURE.find((f) => f.id === id);

export interface Material {
  id: string;
  name: string;
  kind: 'wood' | 'tile' | 'carpet' | 'stone' | 'concrete' | 'vinyl';
  base: string;
  accent: string;
}

export const FLOOR_MATERIALS: Material[] = [
  { id: 'oak-light', name: 'Light oak', kind: 'wood', base: '#c9a87c', accent: '#b38f62' },
  { id: 'oak-natural', name: 'Natural oak', kind: 'wood', base: '#a87e4f', accent: '#8f6a40' },
  { id: 'walnut', name: 'Walnut', kind: 'wood', base: '#5e4130', accent: '#4a3324' },
  { id: 'herringbone', name: 'Herringbone oak', kind: 'wood', base: '#b48d5e', accent: '#9a754b' },
  { id: 'tile-white', name: 'White tile', kind: 'tile', base: '#e9e7e2', accent: '#cfccc5' },
  { id: 'tile-grey', name: 'Grey porcelain', kind: 'tile', base: '#8d8c88', accent: '#777672' },
  { id: 'marble', name: 'Marble', kind: 'stone', base: '#e7e4df', accent: '#b9b4ac' },
  { id: 'terrazzo', name: 'Terrazzo', kind: 'stone', base: '#d8d2c8', accent: '#8f857a' },
  { id: 'concrete', name: 'Polished concrete', kind: 'concrete', base: '#9a9893', accent: '#85837e' },
  { id: 'carpet-beige', name: 'Beige carpet', kind: 'carpet', base: '#bfb29b', accent: '#b0a38c' },
  { id: 'carpet-charcoal', name: 'Charcoal carpet', kind: 'carpet', base: '#4a4a4c', accent: '#404042' },
  { id: 'vinyl-plank', name: 'Vinyl plank', kind: 'vinyl', base: '#9f8a70', accent: '#8a765e' },
];

export const WALL_COLORS: { name: string; hex: string }[] = [
  { name: 'Gallery white', hex: '#f2f0eb' },
  { name: 'Warm white', hex: '#efe8dc' },
  { name: 'Greige', hex: '#cfc6b8' },
  { name: 'Stone', hex: '#b5ab9c' },
  { name: 'Sage', hex: '#a9b5a0' },
  { name: 'Mist blue', hex: '#a7b6c2' },
  { name: 'Navy', hex: '#2f3d55' },
  { name: 'Terracotta', hex: '#b86f52' },
  { name: 'Charcoal', hex: '#3a3a3c' },
  { name: 'Black', hex: '#1d1d1f' },
];

export const CABINET_STYLES = ['Shaker', 'Flat panel', 'Fluted', 'Glass front', 'Handleless'];
export const CABINET_COLORS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#eeece7' },
  { name: 'Oak', hex: '#b48d5e' },
  { name: 'Sage', hex: '#8f9e86' },
  { name: 'Navy', hex: '#2f3d55' },
  { name: 'Black', hex: '#222222' },
  { name: 'Walnut', hex: '#5e4130' },
];
export const BENCHTOPS = ['Marble', 'Quartz white', 'Concrete', 'Timber', 'Granite black', 'Terrazzo'];
export const BATHROOM_TILES = ['Subway white', 'Zellige green', 'Large-format grey', 'Marble', 'Terrazzo', 'Black hex'];

export const ROOM_TYPES: { id: RoomType; label: string; countsByDefault: boolean }[] = [
  { id: 'living', label: 'Living', countsByDefault: true },
  { id: 'bedroom', label: 'Bedroom', countsByDefault: true },
  { id: 'kitchen', label: 'Kitchen', countsByDefault: true },
  { id: 'dining', label: 'Dining', countsByDefault: true },
  { id: 'bathroom', label: 'Bathroom', countsByDefault: true },
  { id: 'hall', label: 'Hall', countsByDefault: true },
  { id: 'laundry', label: 'Laundry', countsByDefault: true },
  { id: 'office', label: 'Office', countsByDefault: true },
  { id: 'storage', label: 'Storage', countsByDefault: true },
  { id: 'stairs', label: 'Stairs', countsByDefault: true },
  { id: 'garage', label: 'Garage', countsByDefault: false },
  { id: 'balcony', label: 'Balcony / porch', countsByDefault: false },
  { id: 'other', label: 'Other', countsByDefault: true },
];

export const roomTypeLabel = (t: RoomType) => ROOM_TYPES.find((r) => r.id === t)?.label ?? t;

export function defaultFinishes(type: RoomType): RoomFinishes {
  const floor =
    type === 'bathroom' || type === 'laundry'
      ? 'tile-white'
      : type === 'kitchen'
        ? 'tile-grey'
        : type === 'bedroom'
          ? 'carpet-beige'
          : type === 'garage' || type === 'balcony'
            ? 'concrete'
            : 'oak-natural';
  return {
    floorMaterial: floor,
    wallColor: '#efe8dc',
    ceilingColor: '#f6f4f0',
    cabinetStyle: type === 'kitchen' || type === 'bathroom' ? 'Shaker' : undefined,
    cabinetColor: type === 'kitchen' || type === 'bathroom' ? '#eeece7' : undefined,
    benchtop: type === 'kitchen' ? 'Quartz white' : undefined,
    bathroomTile: type === 'bathroom' ? 'Subway white' : undefined,
    lightTemperature: 3000,
    lightIntensity: 1,
  };
}

export interface StagingStyle {
  id: string;
  name: string;
  description: string;
  wall: string;
  floor: string;
  accent: string;
  filter: { brightness: number; contrast: number; saturate: number; warmth: number };
  furnitureByRoom: Partial<Record<RoomType, string[]>>;
  palette: string[];
}

export const STAGING_STYLES: StagingStyle[] = [
  {
    id: 'modern-luxury',
    name: 'Modern luxury',
    description: 'Deep neutrals, walnut, brass accents and marble.',
    wall: '#cfc6b8',
    floor: 'walnut',
    accent: '#c8a96a',
    filter: { brightness: 1.03, contrast: 1.08, saturate: 1.02, warmth: 0.06 },
    furnitureByRoom: {
      living: ['sofa-3', 'armchair', 'table-coffee', 'rug-large', 'lamp-floor', 'plant'],
      bedroom: ['bed-king-us', 'table-side', 'table-side', 'dresser'],
      dining: ['table-dining-6', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining'],
      office: ['desk', 'armchair', 'bookcase'],
    },
    palette: ['#2b2723', '#5e4130', '#c8a96a', '#e7e4df'],
  },
  {
    id: 'contemporary',
    name: 'Contemporary',
    description: 'Soft greige, clean lines, layered textures.',
    wall: '#efe8dc',
    floor: 'oak-natural',
    accent: '#7c8b8f',
    filter: { brightness: 1.05, contrast: 1.02, saturate: 1.0, warmth: 0.02 },
    furnitureByRoom: {
      living: ['sofa-l', 'table-coffee', 'rug-large', 'plant'],
      bedroom: ['bed-queen-us', 'table-side', 'table-side'],
      dining: ['table-dining-4', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining'],
      office: ['desk', 'chair-dining', 'bookcase'],
    },
    palette: ['#efe8dc', '#7c8b8f', '#3a3a3c', '#b5ab9c'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'White, light timber, very few pieces.',
    wall: '#f2f0eb',
    floor: 'oak-light',
    accent: '#1d1d1f',
    filter: { brightness: 1.08, contrast: 0.98, saturate: 0.85, warmth: 0 },
    furnitureByRoom: {
      living: ['sofa-2', 'table-coffee'],
      bedroom: ['bed-queen-us', 'table-side'],
      dining: ['table-dining-4', 'chair-dining', 'chair-dining'],
      office: ['desk', 'chair-dining'],
    },
    palette: ['#f2f0eb', '#c9a87c', '#1d1d1f', '#e9e7e2'],
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian',
    description: 'Pale oak, white walls, wool, plants.',
    wall: '#f2f0eb',
    floor: 'oak-light',
    accent: '#a9b5a0',
    filter: { brightness: 1.07, contrast: 1.0, saturate: 0.92, warmth: 0.03 },
    furnitureByRoom: {
      living: ['sofa-3', 'armchair', 'table-coffee', 'rug-large', 'plant', 'lamp-floor'],
      bedroom: ['bed-queen-us', 'table-side', 'table-side', 'plant'],
      dining: ['table-dining-4', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining'],
      office: ['desk', 'chair-dining', 'plant'],
    },
    palette: ['#f2f0eb', '#c9a87c', '#a9b5a0', '#6b6f78'],
  },
  {
    id: 'traditional',
    name: 'Traditional',
    description: 'Warm woods, classic forms, rich colour.',
    wall: '#e3d6bf',
    floor: 'herringbone',
    accent: '#7a2f2a',
    filter: { brightness: 1.0, contrast: 1.05, saturate: 1.08, warmth: 0.1 },
    furnitureByRoom: {
      living: ['sofa-3', 'armchair', 'armchair', 'table-coffee', 'rug-large', 'bookcase'],
      bedroom: ['bed-king-us', 'table-side', 'table-side', 'dresser', 'wardrobe'],
      dining: ['table-dining-6', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining'],
      office: ['desk', 'armchair', 'bookcase'],
    },
    palette: ['#e3d6bf', '#5e4130', '#7a2f2a', '#2f3d55'],
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Concrete, black steel, leather and timber.',
    wall: '#9a9893',
    floor: 'concrete',
    accent: '#b86f52',
    filter: { brightness: 0.98, contrast: 1.12, saturate: 0.9, warmth: 0.04 },
    furnitureByRoom: {
      living: ['sofa-3', 'armchair', 'table-coffee', 'tv-unit', 'lamp-floor'],
      bedroom: ['bed-queen-us', 'table-side', 'bookcase'],
      dining: ['table-dining-6', 'chair-dining', 'chair-dining', 'chair-dining', 'chair-dining'],
      office: ['desk', 'chair-dining', 'bookcase'],
    },
    palette: ['#3a3a3c', '#9a9893', '#b86f52', '#5e4130'],
  },
];
