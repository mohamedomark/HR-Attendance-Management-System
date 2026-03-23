import { Timestamp } from 'firebase/firestore';

export type UserRole = 'employee' | 'hr-admin' | 'manager';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  position?: string;
  employeeId?: string;
  managerId?: string; // For team scope
  isDeleted?: boolean; // Soft delete
  createdAt: Timestamp;
}

export type AttendanceStatus = 'absent' | 'working' | 'completed' | 'incomplete' | 'overtime' | 'leave' | 'paused' | 'auto-completed';

export interface PauseRecord {
  start: Timestamp;
  end?: Timestamp;
}

export interface AttendanceRecord {
  id?: string;
  uid: string;
  date: string; // YYYY-MM-DD
  checkIn?: Timestamp;
  checkOut?: Timestamp;
  status: AttendanceStatus;
  workingHours?: number;
  remainingHours?: number;
  overtimeHours?: number;
  manualOverride?: boolean;
  overrideReason?: string;
  updatedBy?: string;
  pauses?: PauseRecord[];
}

export interface SystemSettings {
  workStartTime: string; // e.g., '09:00'
  lateThresholdMinutes: number;
  autoCheckOutTime: string; // e.g., '23:59'
}

export interface AuditLog {
  id?: string;
  actorId: string;
  actorName: string;
  employeeId: string;
  employeeName: string;
  action: 'pause' | 'resume' | 'auto-checkout' | 'delete' | 'override';
  details?: string;
  timestamp: Timestamp;
}

export type Language = 'en' | 'ar';
