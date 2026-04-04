import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, differenceInMinutes } from 'date-fns';
import { AttendanceStatus, PauseRecord, AttendanceRecord } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime12h(date: Date): string {
  return format(date, 'hh:mm a');
}

export function formatDuration(minutes: number): string {
  const roundedTotalMinutes = Math.round(minutes);
  const h = Math.floor(roundedTotalMinutes / 60);
  const m = roundedTotalMinutes % 60;
  return `${h}h ${m}m`;
}

export function calculateWorkingMinutes(checkIn: Date, checkOut: Date, pauses?: PauseRecord[]): number {
  const totalDurationMs = checkOut.getTime() - checkIn.getTime();
  let totalPauseMs = 0;
  
  if (pauses) {
    pauses.forEach(p => {
      const startMs = p.start.toDate().getTime();
      const endMs = p.end ? p.end.toDate().getTime() : checkOut.getTime();
      
      // Only count pauses that overlap with the working period
      const overlapStart = Math.max(startMs, checkIn.getTime());
      const overlapEnd = Math.min(endMs, checkOut.getTime());
      
      if (overlapEnd > overlapStart) {
        totalPauseMs += (overlapEnd - overlapStart);
      }
    });
  }
  
  const workedMs = totalDurationMs - totalPauseMs;
  return Math.max(0, Math.round(workedMs / (1000 * 60)));
}

export function calculateTotalWorkingMinutes(record: AttendanceRecord, currentTime: Date = new Date()): number {
  let totalMinutes = 0;

  if (record.sessions && record.sessions.length > 0) {
    record.sessions.forEach(session => {
      const checkOutTime = session.checkOut ? session.checkOut.toDate() : currentTime;
      totalMinutes += calculateWorkingMinutes(session.checkIn.toDate(), checkOutTime, session.pauses);
    });
  } else if (record.checkIn) {
    const checkOutTime = record.checkOut ? record.checkOut.toDate() : currentTime;
    totalMinutes += calculateWorkingMinutes(record.checkIn.toDate(), checkOutTime, record.pauses);
  } else if (record.workingHours) {
    return record.workingHours;
  }

  return totalMinutes;
}

export function getAttendanceStatus(record: AttendanceRecord, isOnLeave?: boolean, isPaused?: boolean, isAutoCompleted?: boolean): AttendanceStatus {
  if (isOnLeave) return 'leave';
  if (isAutoCompleted) return 'auto-completed';
  if (isPaused) return 'paused';
  
  const hasActiveSession = record.sessions && record.sessions.length > 0 
    ? !record.sessions[record.sessions.length - 1].checkOut 
    : record.checkIn && !record.checkOut;

  if (!record.checkIn && (!record.sessions || record.sessions.length === 0)) return 'absent';
  if (hasActiveSession) return 'working';

  const minutes = calculateTotalWorkingMinutes(record);
  const requiredMinutes = 8 * 60;

  if (minutes > requiredMinutes) return 'overtime';
  if (minutes >= requiredMinutes) return 'completed';
  return 'incomplete';
}

export function getRemainingOrOvertime(minutes: number, baselineMinutes: number = 8 * 60): { type: 'remaining' | 'overtime' | 'none', value: string } {
  if (minutes === baselineMinutes) return { type: 'none', value: '-' };
  
  if (minutes < baselineMinutes) {
    return { type: 'remaining', value: formatDuration(baselineMinutes - minutes) };
  }
  
  return { type: 'overtime', value: formatDuration(minutes - baselineMinutes) };
}
