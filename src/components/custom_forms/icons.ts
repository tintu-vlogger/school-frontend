/*
 * Icons a custom service can use (names match the API's list), as lucide components.
 */
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck, BookOpen, Briefcase, Building, Bus, Calendar, CalendarCheck, Car, ClipboardList, Coffee, Contact,
  FileText, Gift, GraduationCap, HandCoins, HeartPulse, Home, IdCard, KeyRound, Laptop, Mail, Megaphone, Package,
  Phone, Plane, Printer, ShieldCheck, Shirt, Ticket, Utensils, Wrench,
} from "lucide-react";

export const SERVICE_ICONS: Record<string, LucideIcon> = {
  "clipboard-list": ClipboardList, "graduation-cap": GraduationCap, "id-card": IdCard, contact: Contact,
  "badge-check": BadgeCheck, "key-round": KeyRound, laptop: Laptop, car: Car, plane: Plane, shirt: Shirt,
  utensils: Utensils, home: Home, "heart-pulse": HeartPulse, wrench: Wrench, package: Package, "file-text": FileText,
  "calendar-check": CalendarCheck, megaphone: Megaphone, gift: Gift, "shield-check": ShieldCheck, building: Building,
  phone: Phone, mail: Mail, printer: Printer, coffee: Coffee, bus: Bus, ticket: Ticket, briefcase: Briefcase,
  "book-open": BookOpen, "hand-coins": HandCoins, calendar: Calendar,
};

export function serviceIcon(name: string | null | undefined): LucideIcon {
  return (name && SERVICE_ICONS[name]) || ClipboardList;
}
