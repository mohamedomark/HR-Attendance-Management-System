import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp, 
  handleFirestoreError, 
  OperationType,
  db
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AttendanceRecord, SystemSettings } from '../types';
import { format } from 'date-fns';
import { Clock, CheckCircle, XCircle, AlertTriangle, History, Pause, Play, Edit2 } from 'lucide-react';
import { cn, formatTime12h, formatDuration, getAttendanceStatus, calculateWorkingMinutes, calculateTotalWorkingMinutes, getRemainingOrOvertime } from '../lib/utils';
import { toast } from 'sonner';

const Dashboard: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { t, formatStatus, isRtl } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({ workStartTime: '09:00', lateThresholdMinutes: 15 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Actual Hours State
  const [showActualHoursModal, setShowActualHoursModal] = useState(false);
  const [actualHoursInput, setActualHoursInput] = useState('');
  const [actualNotesInput, setActualNotesInput] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const checkIsPO = (position?: string) => {
    const lowerPos = position?.toLowerCase();
    return lowerPos === 'po' || lowerPos === 'product owner' || lowerPos === 'product owner (po)';
  };
  const isPO = checkIsPO(userProfile?.position);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'attendance'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AttendanceRecord[];
      
      setRecords(fetchedRecords);
      setTodayRecord(fetchedRecords.find(r => r.date === todayStr) || null);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, todayStr]);

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as SystemSettings);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = async () => {
    if (!user) return;

    const now = new Date();
    const sessionId = Date.now().toString();
    
    try {
      if (todayRecord) {
        const hasActiveSession = todayRecord.sessions && todayRecord.sessions.length > 0 
          ? !todayRecord.sessions[todayRecord.sessions.length - 1].checkOut 
          : todayRecord.checkIn && !todayRecord.checkOut;

        if (hasActiveSession) return;

        const newSession = {
          id: sessionId,
          checkIn: Timestamp.fromDate(now)
        };

        let sessions = todayRecord.sessions ? [...todayRecord.sessions] : [];
        if (sessions.length === 0 && todayRecord.checkIn) {
          const legacySession: any = {
            id: 'legacy-session',
            checkIn: todayRecord.checkIn
          };
          if (todayRecord.checkOut) legacySession.checkOut = todayRecord.checkOut;
          if (todayRecord.pauses) legacySession.pauses = todayRecord.pauses;
          sessions.push(legacySession);
        }
        sessions.push(newSession);

        await updateDoc(doc(db, 'attendance', todayRecord.id!), {
          sessions,
          status: 'working',
          manualOverride: false
        });
      } else {
        // Create new record
        await addDoc(collection(db, 'attendance'), {
          uid: user.uid,
          date: todayStr,
          sessions: [{
            id: sessionId,
            checkIn: Timestamp.fromDate(now)
          }],
          status: 'working',
          manualOverride: false
        });
      }
    } catch (error) {
      handleFirestoreError(error, todayRecord ? OperationType.UPDATE : OperationType.CREATE, 'attendance');
    }
  };

  const handleCheckOut = async () => {
    if (!user || !todayRecord) return;

    const hasActiveSession = todayRecord.sessions && todayRecord.sessions.length > 0 
      ? !todayRecord.sessions[todayRecord.sessions.length - 1].checkOut 
      : todayRecord.checkIn && !todayRecord.checkOut;

    if (!hasActiveSession || todayRecord.status === 'paused') return;

    const now = new Date();
    
    try {
      let updatedSessions = todayRecord.sessions ? [...todayRecord.sessions] : [];
      
      if (updatedSessions.length > 0) {
        const lastSession = updatedSessions[updatedSessions.length - 1];
        lastSession.checkOut = Timestamp.fromDate(now);
      } else if (todayRecord.checkIn) {
        const legacySession: any = {
          id: 'legacy-session',
          checkIn: todayRecord.checkIn,
          checkOut: Timestamp.fromDate(now)
        };
        if (todayRecord.pauses) legacySession.pauses = todayRecord.pauses;
        updatedSessions = [legacySession];
      }

      const tempRecord = { ...todayRecord, sessions: updatedSessions };
      const workingHours = calculateTotalWorkingMinutes(tempRecord, now);
      const status = getAttendanceStatus(tempRecord, todayRecord.status === 'leave', false, false);

      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        sessions: updatedSessions,
        workingHours,
        remainingHours: Math.max(0, 8 * 60 - workingHours),
        overtimeHours: Math.max(0, workingHours - 8 * 60),
        status
      });
      toast.success("Checked out successfully.");
      
      if (isPO) {
        setEditingRecordId(todayRecord.id!);
        setActualHoursInput('');
        setActualNotesInput('');
        setShowActualHoursModal(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${todayRecord.id}`);
    }
  };

  const handlePause = async () => {
    if (!user || !todayRecord) return;

    // Validation
    if (todayRecord.status !== 'working') {
      toast.error("Pause is only allowed when employee is working.");
      return;
    }

    const hasActiveSession = todayRecord.sessions && todayRecord.sessions.length > 0 
      ? !todayRecord.sessions[todayRecord.sessions.length - 1].checkOut 
      : todayRecord.checkIn && !todayRecord.checkOut;

    if (!hasActiveSession) {
      toast.error("Cannot pause. Employee has not checked in.");
      return;
    }

    const now = Timestamp.now();
    
    try {
      let updatedSessions = todayRecord.sessions ? [...todayRecord.sessions] : [];
      
      if (updatedSessions.length > 0) {
        const lastSession = updatedSessions[updatedSessions.length - 1];
        lastSession.pauses = [...(lastSession.pauses || []), { start: now }];
      } else if (todayRecord.checkIn) {
        const legacySession: any = {
          id: 'legacy-session',
          checkIn: todayRecord.checkIn,
          pauses: [...(todayRecord.pauses || []), { start: now }]
        };
        if (todayRecord.checkOut) legacySession.checkOut = todayRecord.checkOut;
        updatedSessions = [legacySession];
      }

      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        sessions: updatedSessions,
        status: 'paused'
      });
      toast.success("Employee paused successfully.");
    } catch (error) {
      toast.error("Failed to pause. Please try again.");
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${todayRecord.id}`);
    }
  };

  const handleResume = async () => {
    if (!user || !todayRecord) return;

    // Validation
    if (todayRecord.status !== 'paused') {
      toast.error("Resume is only allowed when employee is paused.");
      return;
    }

    const now = Timestamp.now();
    
    try {
      let updatedSessions = todayRecord.sessions ? [...todayRecord.sessions] : [];
      
      if (updatedSessions.length > 0) {
        const lastSession = updatedSessions[updatedSessions.length - 1];
        if (lastSession.pauses && lastSession.pauses.length > 0) {
          const lastPause = lastSession.pauses[lastSession.pauses.length - 1];
          if (!lastPause.end) {
            lastPause.end = now;
          }
        }
      } else if (todayRecord.checkIn) {
        const legacySession: any = {
          id: 'legacy-session',
          checkIn: todayRecord.checkIn,
          pauses: [...(todayRecord.pauses || [])]
        };
        if (todayRecord.checkOut) legacySession.checkOut = todayRecord.checkOut;
        updatedSessions = [legacySession];
        const lastPause = updatedSessions[0].pauses![updatedSessions[0].pauses!.length - 1];
        if (lastPause && !lastPause.end) {
          lastPause.end = now;
        }
      }

      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        sessions: updatedSessions,
        status: 'working'
      });
      toast.success("Resumed successfully.");
    } catch (error) {
      toast.error("Failed to resume. Please try again.");
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${todayRecord.id}`);
    }
  };

  const handleSaveActualHours = async () => {
    if (!editingRecordId) return;
    
    const record = records.find(r => r.id === editingRecordId);
    if (!record) return;

    const actualHoursNum = parseFloat(actualHoursInput);
    if (isNaN(actualHoursNum) || actualHoursNum < 0) {
      toast.error("Actual hours must be a positive number.");
      return;
    }

    try {
      const calcMinutes = Math.round(actualHoursNum * 60);
      const requiredMinutes = 8 * 60;
      let remainingHours = 0;
      let overtimeHours = 0;
      
      if (calcMinutes > requiredMinutes) {
        overtimeHours = calcMinutes - requiredMinutes;
      } else {
        remainingHours = requiredMinutes - calcMinutes;
      }

      await updateDoc(doc(db, 'attendance', editingRecordId), {
        actualHours: actualHoursNum,
        actualNotes: actualNotesInput,
        remainingHours,
        overtimeHours
      });
      toast.success("Actual hours saved successfully.");
      setShowActualHoursModal(false);
      setEditingRecordId(null);
    } catch (error) {
      toast.error("Failed to save actual hours.");
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${editingRecordId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900">
          {userProfile?.name}
        </h2>
        <p className="text-gray-500 mt-1">{userProfile?.position} • {userProfile?.employeeId}</p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center space-y-4">
          <div className="p-4 bg-blue-50 rounded-full text-blue-600">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{t('emp.check_in')} / {t('emp.check_out')}</h3>
            <p className="text-gray-500 text-sm">{format(new Date(), 'EEEE, MMMM do')}</p>
          </div>
          
            <div className="flex flex-col gap-4 w-full">
              <div className="flex gap-4 w-full">
                {(() => {
                  const hasActiveSession = todayRecord?.sessions && todayRecord.sessions.length > 0 
                    ? !todayRecord.sessions[todayRecord.sessions.length - 1].checkOut 
                    : todayRecord?.checkIn && !todayRecord?.checkOut;

                  const hasCheckedInAtLeastOnce = todayRecord?.checkIn || (todayRecord?.sessions && todayRecord.sessions.length > 0);

                  return (
                    <>
                      <button
                        onClick={handleCheckIn}
                        disabled={hasActiveSession}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                          hasActiveSession 
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                            : "bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg"
                        )}
                      >
                        <CheckCircle className="w-5 h-5" />
                        {hasCheckedInAtLeastOnce ? (hasActiveSession ? t('emp.checked_in') : "Start Extra Session") : t('emp.check_in')}
                      </button>

                      <button
                        onClick={handleCheckOut}
                        disabled={!hasActiveSession || todayRecord?.status === 'paused'}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                          (!hasActiveSession || todayRecord?.status === 'paused')
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                            : "bg-orange-600 text-white hover:bg-orange-700 shadow-md hover:shadow-lg"
                        )}
                      >
                        <XCircle className="w-5 h-5" />
                        {t('emp.check_out')}
                      </button>
                    </>
                  );
                })()}
              </div>

              {(() => {
                const hasActiveSession = todayRecord?.sessions && todayRecord.sessions.length > 0 
                  ? !todayRecord.sessions[todayRecord.sessions.length - 1].checkOut 
                  : todayRecord?.checkIn && !todayRecord?.checkOut;

                if (!hasActiveSession) return null;

                return (
                  <div className="flex gap-4 w-full">
                    {todayRecord?.status === 'working' ? (
                      <button
                        onClick={handlePause}
                        className="flex-1 py-3 px-4 rounded-lg font-medium bg-yellow-500 text-white hover:bg-yellow-600 transition-all flex items-center justify-center gap-2 shadow-md"
                      >
                        <Pause className="w-5 h-5" />
                        {t('emp.pause')}
                      </button>
                    ) : todayRecord?.status === 'paused' ? (
                      <button
                        onClick={handleResume}
                        className="flex-1 py-3 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-md"
                      >
                        <Play className="w-5 h-5" />
                        {t('emp.resume')}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          
          {todayRecord && (todayRecord.checkIn || (todayRecord.sessions && todayRecord.sessions.length > 0)) && (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <span className={cn(
                  "px-2 py-1 rounded-full text-xs",
                  todayRecord.status === 'completed' || todayRecord.status === 'overtime' ? "bg-green-100 text-green-700" : 
                  todayRecord.status === 'working' ? "bg-blue-100 text-blue-700" :
                  todayRecord.status === 'paused' ? "bg-yellow-100 text-yellow-700" :
                  todayRecord.status === 'incomplete' ? "bg-orange-100 text-orange-700" :
                  todayRecord.status === 'leave' ? "bg-purple-100 text-purple-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {formatStatus(todayRecord.status)}
                </span>
              </div>
              
              <div className="w-full mt-4 space-y-2">
                {(() => {
                  let sessionsToDisplay = todayRecord.sessions || [];
                  if (sessionsToDisplay.length === 0 && todayRecord.checkIn) {
                    sessionsToDisplay = [{
                      id: 'legacy',
                      checkIn: todayRecord.checkIn,
                      checkOut: todayRecord.checkOut,
                      pauses: todayRecord.pauses
                    }];
                  }

                  return sessionsToDisplay.map((session, index) => (
                    <div key={session.id} className="bg-gray-50 rounded-lg p-3 flex justify-between items-center text-sm border border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-700">Session {index + 1}</span>
                        <div className="flex items-center gap-2 text-gray-500">
                          <span>{formatTime12h(session.checkIn.toDate())}</span>
                          <span>→</span>
                          <span>{session.checkOut ? formatTime12h(session.checkOut.toDate()) : 'Active'}</span>
                        </div>
                      </div>
                      <span className="font-medium text-gray-900">
                        {formatDuration(calculateWorkingMinutes(session.checkIn.toDate(), session.checkOut ? session.checkOut.toDate() : currentTime, session.pauses))}
                      </span>
                    </div>
                  ));
                })()}
              </div>

              {todayRecord.status === 'leave' && todayRecord.checkIn && todayRecord.checkOut && (
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 px-2 py-0.5 rounded border border-purple-100 mt-2">
                  Attendance During Leave (Conflict)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('hr.overview')}</h3>
            <AlertTriangle className="w-5 h-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('emp.hours')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {(() => {
                  let minutes = todayRecord ? calculateTotalWorkingMinutes(todayRecord, currentTime) : 0;
                  
                  if (isPO && todayRecord?.actualHours !== undefined) {
                    minutes = Math.round(todayRecord.actualHours * 60);
                  }
                  
                  return minutes > 0 ? formatDuration(minutes) : '0h 0m';
                })()}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('emp.status')}</p>
              <p className="text-2xl font-bold text-gray-900">{todayRecord ? formatStatus(todayRecord.status) : '-'}</p>
            </div>
            
            {todayRecord && (
              <>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-xs text-orange-600 uppercase font-bold tracking-wider">{t('emp.remaining')}</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {(() => {
                      const attendanceMinutes = calculateTotalWorkingMinutes(todayRecord, currentTime);
                      let minutes = attendanceMinutes;
                      if (isPO && todayRecord.actualHours !== undefined) {
                        minutes = Math.round(todayRecord.actualHours * 60);
                      }
                      const baseline = 8 * 60;
                      const rem = getRemainingOrOvertime(minutes, baseline);
                      return rem.type === 'remaining' ? rem.value : '0h 0m';
                    })()}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600 uppercase font-bold tracking-wider">{t('emp.overtime')}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {(() => {
                      const attendanceMinutes = calculateTotalWorkingMinutes(todayRecord, currentTime);
                      let minutes = attendanceMinutes;
                      if (isPO && todayRecord.actualHours !== undefined) {
                        minutes = Math.round(todayRecord.actualHours * 60);
                      }
                      const baseline = 8 * 60;
                      const rem = getRemainingOrOvertime(minutes, baseline);
                      return rem.type === 'overtime' ? rem.value : '0h 0m';
                    })()}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold">{t('emp.history')}</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">{t('emp.date')}</th>
                <th className="px-6 py-4">{t('emp.check_in')}</th>
                <th className="px-6 py-4">{t('emp.check_out')}</th>
                <th className="px-6 py-4">{t('emp.hours')}</th>
                {isPO && <th className="px-6 py-4">Actual Hours</th>}
                <th className="px-6 py-4">{t('emp.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => {
                const attendanceMinutes = calculateTotalWorkingMinutes(record, currentTime);
                const attendanceHours = attendanceMinutes / 60;
                
                let sessionsToDisplay = record.sessions || [];
                if (sessionsToDisplay.length === 0 && record.checkIn) {
                  sessionsToDisplay = [{
                    id: 'legacy',
                    checkIn: record.checkIn,
                    checkOut: record.checkOut,
                    pauses: record.pauses
                  }];
                }

                return (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium align-top">{record.date}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 align-top">
                    {sessionsToDisplay.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {sessionsToDisplay.map((session, idx) => (
                          <div key={session.id} className="flex items-center gap-2">
                            {sessionsToDisplay.length > 1 && <span className="text-xs font-medium text-gray-400 w-4">{idx + 1}.</span>}
                            <span>{formatTime12h(session.checkIn.toDate())}</span>
                          </div>
                        ))}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 align-top">
                    {sessionsToDisplay.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {sessionsToDisplay.map((session, idx) => (
                          <div key={session.id} className="flex items-center gap-2">
                            {sessionsToDisplay.length > 1 && <span className="text-xs font-medium text-gray-400 w-4">{idx + 1}.</span>}
                            <span>{session.checkOut ? formatTime12h(session.checkOut.toDate()) : 'Active'}</span>
                          </div>
                        ))}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 align-top">
                    <div className="flex flex-col gap-2">
                      {sessionsToDisplay.length > 1 && sessionsToDisplay.map((session, idx) => (
                        <div key={session.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="w-4">{idx + 1}.</span>
                          <span>{formatDuration(calculateWorkingMinutes(session.checkIn.toDate(), session.checkOut ? session.checkOut.toDate() : currentTime, session.pauses))}</span>
                        </div>
                      ))}
                      <div className={cn("font-medium", sessionsToDisplay.length > 1 ? "mt-2 pt-2 border-t border-gray-100 text-gray-900" : "")}>
                        {attendanceMinutes > 0 ? formatDuration(attendanceMinutes) : '0h 0m'}
                      </div>
                    </div>
                  </td>
                  {isPO && (
                    <td className="px-6 py-4 text-sm text-gray-600 align-top">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          record.actualHours !== undefined
                            ? record.actualHours < attendanceHours
                              ? "text-orange-600 font-medium"
                              : record.actualHours > attendanceHours
                                ? "text-blue-600 font-medium"
                                : "text-green-600 font-medium"
                            : ""
                        )}>
                          {record.actualHours !== undefined ? `${record.actualHours}h` : '-'}
                        </span>
                        {record.actualHours !== undefined && record.actualHours < attendanceHours && (
                          <AlertTriangle className="w-4 h-4 text-orange-500" title="Actual hours less than attendance hours" />
                        )}
                        {record.actualHours !== undefined && record.actualHours > attendanceHours && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider" title="Over-performance">Over</span>
                        )}
                        <button
                          onClick={() => {
                            setEditingRecordId(record.id!);
                            setActualHoursInput(record.actualHours?.toString() || '');
                            setActualNotesInput(record.actualNotes || '');
                            setShowActualHoursModal(true);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit Actual Hours"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                      {record.actualNotes && (
                        <p className="text-xs text-gray-400 mt-1 truncate max-w-[150px]" title={record.actualNotes}>
                          {record.actualNotes}
                        </p>
                      )}
                    </td>
                  )}
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium w-fit",
                          record.status === 'completed' || record.status === 'overtime' ? "bg-green-100 text-green-700" : 
                          record.status === 'auto-completed' ? "bg-teal-100 text-teal-700" :
                          record.status === 'working' ? "bg-blue-100 text-blue-700" :
                          record.status === 'paused' ? "bg-yellow-100 text-yellow-700" :
                          record.status === 'incomplete' ? "bg-orange-100 text-orange-700" :
                          record.status === 'leave' ? "bg-purple-100 text-purple-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {formatStatus(record.status)}
                        </span>
                        {record.autoClosed && (
                          <span className="text-[10px] font-bold text-teal-600 uppercase tracking-tighter">
                            Auto Closed
                          </span>
                        )}
                        {record.status === 'leave' && record.checkIn && record.checkOut && (
                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tighter">
                            Conflict
                          </span>
                        )}
                      </div>
                    </td>
                </tr>
              )})}
              {records.length === 0 && (
                <tr>
                  <td colSpan={isPO ? 6 : 5} className="px-6 py-12 text-center text-gray-500">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actual Hours Modal */}
      {showActualHoursModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Enter Actual Hours</h3>
              <p className="text-sm text-gray-500 mt-1">Please enter the actual hours you worked on tasks today.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actual Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={actualHoursInput}
                  onChange={(e) => setActualHoursInput(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 7.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={actualNotesInput}
                  onChange={(e) => setActualNotesInput(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Explain any discrepancies..."
                  rows={3}
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowActualHoursModal(false);
                  setEditingRecordId(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActualHours}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
