/*
 * Campusly web UI kit. Import everything from "@/components/ui-kit".
 * Rule: Add, Edit and View-details open in a centered <Modal> (sizes sm/md/lg/xl/full),
 * never a separate page and never a side drawer. Lists use <FilterBar> + <DataTable>;
 * row click opens a detail modal; confirmations use useConfirm() / <ConfirmDialog>.
 * Live showcase: /dashboard/ui-kit.
 */
export { Button, IconButton } from "./button";
export type { ButtonProps, ButtonVariant, IconButtonProps, IconType } from "./button";
export { Modal, ModalCancel, useModalClose, ConfirmDialog } from "./modal";
export type { ModalProps, ModalSize, ConfirmDialogProps, ConfirmTone } from "./modal";
export { ConfirmProvider, useConfirm } from "./confirm";
export type { ConfirmOptions } from "./confirm";
export { Tabs } from "./tabs";
export type { TabItem, TabsProps } from "./tabs";
export { Stepper } from "./stepper";
export type { StepItem, StepperProps } from "./stepper";
export { DataTable, paginate } from "./data-table";
export type { Column, DataTableProps, SortState, Pagination, BulkAction } from "./data-table";
export { FilterBar } from "./filter-bar";
export type { FilterBarProps, FilterDef, FilterOption, FilterValues } from "./filter-bar";
export { Menu } from "./menu";
export type { MenuItem, MenuAction, MenuProps } from "./menu";
export {
  Field, FormGrid, FormSection, useField, TextInput, Textarea, NumberInput, TimeInput, Toggle, Checkbox, RadioCards,
} from "./fields";
export type {
  FieldProps, TextInputProps, TextareaProps, NumberInputProps, TimeInputProps, ToggleProps, CheckboxProps, RadioCardsProps, RadioCardOption,
} from "./fields";
export { DateInput, DateRangeInput, Calendar, formatDisplayDate, parseISODate, toISODate } from "./date";
export type { DateInputProps, DateRangeInputProps, DateRange, CalendarProps } from "./date";
export { Select, MultiSelect } from "./select";
export { MasterSelect, useMasterLabels } from "./master-select";
export type { MasterSelectProps } from "./master-select";
export type { SelectProps, MultiSelectProps, SelectOption, SelectValue } from "./select";
export { FileDrop, formatBytes } from "./file-drop";
export type { FileDropProps } from "./file-drop";
export { Avatar, AvatarGroup, avatarTint, initialsOf } from "./avatar";
export type { AvatarProps } from "./avatar";
export { Badge, Chip } from "./badge";
export type { BadgeTone } from "./badge";
export { StatCard, StatGrid } from "./stat-card";
export type { StatTrend } from "./stat-card";
export { Timeline } from "./timeline";
export type { TimelineItem } from "./timeline";
export { KeyValue, Section } from "./key-value";
export type { KeyValueItem } from "./key-value";
export { Skeleton, SkeletonText } from "./skeleton";
export { ToastViewport } from "./toast";
export type { ToastOptions, ToastTone } from "./toast";
export { useToast } from "@/lib/toast-context";
