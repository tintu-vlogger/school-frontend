/* Shapes returned by /api/v1/transport (see backend/modules/transport/router.py). */

export type ExpiryState = "expired" | "soon" | "ok" | null;

export interface Vehicle {
  id: number; uuid: string; registration_no: string; name: string | null; kind: string; make_model: string | null;
  capacity: number; fuel: string | null; ownership: "own" | "contract"; contractor: string | null;
  insurance_expiry: string | null; permit_expiry: string | null; fitness_expiry: string | null; pollution_expiry: string | null;
  gps_device_id: string | null; notes: string | null; active: boolean;
  next_expiry?: string | null; expiry_state?: ExpiryState; routes?: string[];
}

export interface Crew {
  id: number; uuid: string; kind: "driver" | "attendant"; employee_id: number | null; employee_name: string | null;
  name: string; phone: string | null; licence_no: string | null; licence_expiry: string | null; badge_no: string | null;
  photo_url: string | null; notes: string | null; active: boolean; licence_state?: ExpiryState;
}

export interface Zone { id: number; uuid: string; name: string; fee: string; description: string | null; active: boolean }

export interface Stop {
  id: number; uuid: string; name: string; sequence: number; pickup_time: string | null; drop_time: string | null;
  distance_km: number | null; zone_id: number | null; zone_name: string | null; fee: string | null; effective_fee: string | null;
  landmark: string | null; active: boolean; riders: number | null;
}

export interface Route {
  id: number; uuid: string; name: string; code: string | null; start_point: string | null; notes: string | null; active: boolean;
  capacity: number | null; seats: number | null; riders: number; vehicle_id: number | null; vehicle: string | null;
  vehicle_reg: string | null; driver_id: number | null; driver: string | null; attendant_id: number | null; attendant: string | null;
  stop_count: number; first_pickup: string | null; distance_km: number;
  stops?: Stop[]; driver_detail?: Crew | null; attendant_detail?: Crew | null;
}

export interface Rider {
  id: number; uuid: string; student_id: number; student_uuid: string; student_name: string; admission_no: string;
  photo_url: string | null; section_label: string | null; route_uuid: string; route: string; stop_uuid: string; stop: string;
  pickup_time: string | null; drop_time: string | null; direction: "both" | "pickup" | "drop"; start_date: string;
  end_date: string | null; status: string; state: "current" | "upcoming" | "ended"; fee_amount: string | null;
  fee_ref: string | null; notes: string | null;
}

export interface Expiring {
  kind: "vehicle" | "crew"; uuid: string; name: string; registration_no: string | null; document: string;
  expires_on: string; days_left: number;
}

export interface TransportSummary {
  routes: number; vehicles: number; riders: number; seats: number; full_routes: number; expiring: number; expired: number;
  loads: { uuid: string; name: string; riders: number; seats: number | null }[]; expiring_items: Expiring[];
}

export interface Contact { name: string; phone: string | null; photo_url: string | null }

export interface RiderSummary {
  uuid: string; route: string; route_code: string | null; stop: string; landmark: string | null; pickup_time: string | null;
  drop_time: string | null; direction: string; start_date: string; end_date: string | null;
  vehicle: { name: string | null; registration_no: string; kind: string } | null;
  driver: Contact | null; attendant: Contact | null; fee_amount: string | null;
}

export const VEHICLE_KINDS = [
  { value: "bus", label: "Bus" }, { value: "minibus", label: "Minibus" }, { value: "van", label: "Van" },
  { value: "car", label: "Car" }, { value: "auto", label: "Auto" }, { value: "other", label: "Other" },
];

export const DIRECTIONS = [
  { value: "both", label: "Pickup and drop" }, { value: "pickup", label: "Pickup only" }, { value: "drop", label: "Drop only" },
];
