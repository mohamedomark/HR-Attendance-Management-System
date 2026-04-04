import React, { useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, Timestamp, Query, DocumentData } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceRecord, SystemSettings } from '../types';
import { calculateTotalWorkingMinutes, getAttendanceStatus } from '../lib/utils';

export const AutoCheckOutService: React.FC = () => {
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user) return;

    const checkAutoCheckOut = async () => {
      try {
        // Fetch settings to get autoCheckOutTime
        const settingsDocRef = doc(db, 'settings', 'global');
        const settingsDoc = await getDoc(settingsDocRef);
        let autoCheckOutTime = '23:59';
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data() as SystemSettings;
          if (settings.autoCheckOutTime) {
            autoCheckOutTime = settings.autoCheckOutTime;
          }
        }

        // Parse autoCheckOutTime (e.g., "17:00")
        const [autoHour, autoMinute] = autoCheckOutTime.split(':').map(Number);

        // Fetch records that might need auto check-out
        // Since we can't easily query by multiple statuses without an index,
        // we fetch the user's recent records, or if admin, we can fetch all recent records.
        // Actually, it's better to fetch records where status is 'working' or 'paused'.
        // To avoid index issues, we just fetch records from the last 2 days.
        
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const todayStr = now.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let q: Query<DocumentData>;
        if (isAdmin) {
          q = query(
            collection(db, 'attendance'),
            where('date', 'in', [todayStr, yesterdayStr])
          );
        } else {
          q = query(
            collection(db, 'attendance'),
            where('uid', '==', user.uid),
            where('date', 'in', [todayStr, yesterdayStr])
          );
        }

        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));

        for (const record of records) {
          // Check if record has an open session
          const hasActiveSession = record.sessions && record.sessions.length > 0 
            ? !record.sessions[record.sessions.length - 1].checkOut 
            : record.checkIn && !record.checkOut;

          if (!hasActiveSession) continue;

          // Determine the auto check-out Date object for this record's date
          const [year, month, day] = record.date.split('-').map(Number);
          let recordDate = new Date(year, month - 1, day, autoHour, autoMinute, 0, 0);

          // Get the check-in time of the active session
          let activeCheckInDate: Date | null = null;
          if (record.sessions && record.sessions.length > 0) {
            activeCheckInDate = record.sessions[record.sessions.length - 1].checkIn.toDate();
          } else if (record.checkIn) {
            activeCheckInDate = record.checkIn.toDate();
          }

          // If the auto check-out time is before the check-in time, it likely means
          // the auto check-out time is meant for the next day (e.g., check-in at 20:00, auto check-out at 02:00)
          if (activeCheckInDate && recordDate <= activeCheckInDate) {
            recordDate.setDate(recordDate.getDate() + 1);
          }

          // If current time is >= auto check-out time for that record
          if (now >= recordDate) {
            // We need to auto check-out at the autoCheckOutTime
            let updatedSessions = record.sessions ? [...record.sessions] : [];
            const checkOutTimestamp = Timestamp.fromDate(recordDate);
            
            if (updatedSessions.length > 0) {
              const lastSession = updatedSessions[updatedSessions.length - 1];
              lastSession.checkOut = checkOutTimestamp;
            } else if (record.checkIn) {
              const legacySession: any = {
                id: 'legacy-session',
                checkIn: record.checkIn,
                checkOut: checkOutTimestamp
              };
              if (record.pauses) legacySession.pauses = record.pauses;
              updatedSessions = [legacySession];
            }

            const tempRecord = { ...record, sessions: updatedSessions };
            const workingHours = calculateTotalWorkingMinutes(tempRecord, recordDate);
            // We pass true for isAutoCompleted to getAttendanceStatus if we modify it,
            // or we can just set status to 'auto-completed'
            const status = 'auto-completed';

            await updateDoc(doc(db, 'attendance', record.id!), {
              sessions: updatedSessions,
              workingHours,
              remainingHours: Math.max(0, 8 * 60 - workingHours),
              overtimeHours: Math.max(0, workingHours - 8 * 60),
              status,
              autoClosed: true
            });
          }
        }
      } catch (error) {
        console.error("Auto Check-Out Error:", error);
        // We don't want to throw and crash the app, but we can log it properly
        try {
          handleFirestoreError(error, OperationType.UPDATE, 'attendance');
        } catch (e) {
          // Ignore the thrown error from handleFirestoreError
        }
      }
    };

    // Run immediately on mount
    checkAutoCheckOut();

    // Then run every minute
    const intervalId = setInterval(checkAutoCheckOut, 60000);

    return () => clearInterval(intervalId);
  }, [user, isAdmin]);

  return null;
};
