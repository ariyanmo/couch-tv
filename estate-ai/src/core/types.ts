// Core data model. All lengths are stored in millimetres, all areas in mm².
// Every dimension carries a provenance so the app never presents an estimate
// as a verified measurement.

export type Provenance =
  | 'measured' // taken with tape / laser / known plan, entered by the user
  | 'estimated' // camera reference estimate or a guess the user flagged as such
  | 'drawn' // follows from geometry the user drew on screen, not measured
  | 'unknown'; // nothing recorded

export type MeasureMethod = 'tape' | 'laser' | 'plan' | 'camera-reference' | 'camera-scan' | 'manual-estimate' | 'drawn';

export interface Measure {
  value: number; // mm
  status: Provenance;
  method?: MeasureMethod;
  note?: string;
  at?: number; // timestamp
}

export interface Point {
  x: number;
  y: number;
}

export type UnitSystem = 'metric' | 'imperial';

export type OpeningType = 'door' | 'window' | 'opening' | 'sliding-door' | 'double-door';

export interface Opening {
  id: string;
  type: OpeningType;
  edge: number; // index of polygon edge (vertex i -> i+1)
  offset: number; // mm from the edge start vertex to the near side of the opening
  width: Measure;
  height: Measure;
  sill: Measure; // mm above the floor (0 for doors)
  swing?: 'left' | 'right'; // door hinge side seen from inside the room
  swingIn?: boolean; // door opens into this room
  connectsTo?: string; // room id on the other side
  label?: string;
}

export type FurnitureKind =
  | 'bed'
  | 'sofa'
  | 'table'
  | 'chair'
  | 'cabinet'
  | 'appliance'
  | 'storage'
  | 'desk'
  | 'rug'
  | 'tv'
  | 'plant'
  | 'lamp'
  | 'bath'
  | 'toilet'
  | 'vanity'
  | 'shower';

export interface FurnitureItem {
  id: string;
  catalogId: string;
  name: string;
  kind: FurnitureKind;
  x: number; // centre, room-local plan coordinates (same space as polygon)
  y: number;
  rotation: number; // degrees, clockwise in plan
  w: number; // mm along local x
  d: number; // mm along local y
  h: number; // mm height
  color?: string;
}

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining'
  | 'hall'
  | 'laundry'
  | 'office'
  | 'garage'
  | 'balcony'
  | 'storage'
  | 'stairs'
  | 'other';

export interface RoomFinishes {
  floorMaterial: string; // material id
  wallColor: string; // hex
  ceilingColor: string;
  cabinetStyle?: string;
  cabinetColor?: string;
  benchtop?: string;
  bathroomTile?: string;
  lightTemperature: number; // kelvin
  lightIntensity: number; // 0..2
}

export interface DesignConcept {
  id: string;
  name: string;
  createdAt: number;
  finishes: RoomFinishes;
  furniture: FurnitureItem[];
  notes?: string;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  type: RoomType;
  countsTowardArea: boolean;
  // Polygon vertices in floor plan coordinates (mm), clockwise or ccw.
  // Empty means the room shape is not known yet.
  polygon: Point[];
  // Provenance of each edge length; index i = edge from vertex i to i+1.
  edges: Measure[];
  ceilingHeight: Measure;
  wallThickness: number; // mm, drawn outward from interior dimensions
  openings: Opening[];
  furniture: FurnitureItem[]; // current/existing layout
  finishes: RoomFinishes; // existing finishes ("before")
  concepts: DesignConcept[]; // renovation concepts ("after")
  activeConceptId?: string;
  notes?: string;
  listingText?: string; // optional hand-written description for listings
  customMeasures?: CustomMeasure[]; // anything else the user measured (e.g. "window to corner")
  captureChecklist?: Record<string, boolean>;
  // Closure error from a wall-walk entry (mm). Shown honestly to the user.
  closureError?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomMeasure {
  id: string;
  label: string;
  value: Measure;
}

/** A dimension line drawn on the plan with the tape tool. */
export interface Annotation {
  id: string;
  floorId: string;
  a: Point;
  b: Point;
  label?: string;
  measured?: Measure; // what the user measured in the room; absent = only the drawn distance
}

export interface Floor {
  id: string;
  name: string;
  level: number; // 0 = ground
  elevation: number; // mm, floor level height above ground floor
  defaultCeiling: number; // mm suggestion only; rooms keep their own status
}

export interface RoomConnection {
  id: string;
  a: string;
  b: string;
  openingId?: string;
  kind: 'door' | 'opening' | 'stairs' | 'adjacent';
}

export type Condition = 'good' | 'fair' | 'poor' | 'damaged' | 'na';

export type InspectionCategory =
  | 'damage'
  | 'outdated'
  | 'flooring'
  | 'walls'
  | 'ceiling'
  | 'windows'
  | 'kitchen'
  | 'bathroom'
  | 'opportunity'
  | 'other';

export interface InspectionItem {
  id: string;
  roomId?: string; // undefined = whole property
  category: InspectionCategory;
  condition: Condition;
  title: string;
  note: string;
  photoIds: string[];
  // 'observation' = the user's own visual notes. 'professional' = copied from
  // a licensed inspector's report. They are never mixed in summaries.
  source: 'observation' | 'professional';
  inspector?: string;
  reportRef?: string;
  createdAt: number;
}

export interface PhotoMeta {
  id: string; // also the key of the blob store
  propertyId: string;
  roomId?: string;
  name: string;
  note?: string;
  tags: string[];
  takenAt: number;
  addedAt: number;
  width: number;
  height: number;
  assignedBy?: 'capture' | 'user' | 'suggestion';
  shot?: string; // guided capture slot id
  planPin?: { x: number; y: number; dir: number }; // floor plan location
  collectionIds: string[];
}

export interface PhotoCollection {
  id: string;
  name: string;
  photoIds: string[];
  createdAt: number;
}

export interface ExportRecord {
  id: string;
  kind: 'pdf' | 'png' | 'svg' | 'json';
  name: string;
  createdAt: number;
  size: number;
}

export interface AreaSettings {
  // Room types that count by default when a room is created.
  excludedTypes: RoomType[];
  flooringWastePct: number;
  paintCoveragePerLitre: number; // m² per litre per coat
  paintCoats: number;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  createdAt: number;
  updatedAt: number;
  units: UnitSystem;
  floors: Floor[];
  rooms: Room[];
  connections: RoomConnection[];
  inspection: InspectionItem[];
  collections: PhotoCollection[];
  exports: ExportRecord[];
  areaSettings: AreaSettings;
  description?: string;
  highlights?: string[];
  coverPhotoId?: string;
  listingPhotoIds?: string[];
  annotations?: Annotation[];
  agent?: { name?: string; phone?: string; email?: string; agency?: string };
}

export interface AppSettings {
  units: UnitSystem;
  ai: {
    enabled: boolean; // off by default
    provider: 'ollama' | 'openai-compatible';
    endpoint: string;
    model: string;
    apiKey?: string;
  };
  gridMm: number;
  snap: boolean;
}
