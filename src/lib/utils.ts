import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, differenceInMinutes } from 'date-fns';
import { AttendanceStatus, PauseRecord } from '../types';

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

export function getAttendanceStatus(checkIn?: Date, checkOut?: Date, isOnLeave?: boolean, isPaused?: boolean, pauses?: PauseRecord[], isAutoCompleted?: boolean): AttendanceStatus {
  if (isOnLeave) return 'leave';
  if (isAutoCompleted) return 'auto-completed';
  if (isPaused) return 'paused';
  if (!checkIn) return 'absent';
  if (!checkOut) return 'working';

  const minutes = calculateWorkingMinutes(checkIn, checkOut, pauses);
  const requiredMinutes = 8 * 60;

  if (minutes > requiredMinutes) return 'overtime';
  if (minutes >= requiredMinutes) return 'completed';
  return 'incomplete';
}

export function getRemainingOrOvertime(minutes: number): { type: 'remaining' | 'overtime' | 'none', value: string } {
  const requiredMinutes = 8 * 60;
  if (minutes === requiredMinutes) return { type: 'none', value: '-' };
  
  if (minutes < requiredMinutes) {
    return { type: 'remaining', value: formatDuration(requiredMinutes - minutes) };
  }
  
  return { type: 'overtime', value: formatDuration(minutes - requiredMinutes) };
}
