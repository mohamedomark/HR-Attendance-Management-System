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
import { Clock, CheckCircle, XCircle, AlertTriangle, History, Pause, Play } from 'lucide-react';
import { cn, formatTime12h, formatDuration, getAttendanceStatus, calculateWorkingMinutes, getRemainingOrOvertime } from '../lib/utils';
import { toast } from 'sonner';

const Dashboard: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { t, formatStatus, isRtl } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({ workStartTime: '09:00', lateThresholdMinutes: 15 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

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
    if (todayRecord && todayRecord.checkIn) return;

    const now = new Date();
    
    try {
      if (todayRecord) {
        // If record exists (e.g. from an override or leave), update it
        await updateDoc(doc(db, 'attendance', todayRecord.id!), {
          checkIn: Timestamp.fromDate(now),
          status: 'working',
          manualOverride: false
        });
      } else {
        // Create new record
        await addDoc(collection(db, 'attendance'), {
          uid: user.uid,
          date: todayStr,
          checkIn: Timestamp.fromDate(now),
          status: 'working',
          manualOverride: false
        });
      }
    } catch (error) {
      handleFirestoreError(error, todayRecord ? OperationType.UPDATE : OperationType.CREATE, 'attendance');
    }
  };

  const handleCheckOut = async () => {
    if (!user || !todayRecord || todayRecord.checkOut) return;

    const now = new Date();
    const checkInDate = todayRecord.checkIn?.toDate();
    const workingHours = checkInDate ? calculateWorkingMinutes(checkInDate, now, todayRecord.pauses) : 0;
    const status = getAttendanceStatus(checkInDate, now, todayRecord.status === 'leave', false, todayRecord.pauses);

    try {
      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        checkOut: Timestamp.fromDate(now),
        workingHours,
        remainingHours: Math.max(0, 8 * 60 - workingHours),
        overtimeHours: Math.max(0, workingHours - 8 * 60),
        status
      });
      toast.success("Checked out successfully.");
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
    if (!todayRecord.checkIn) {
      toast.error("Cannot pause. Employee has not checked in.");
      return;
    }

    const now = Timestamp.now();
    const pauses = [...(todayRecord.pauses || [])];
    pauses.push({ start: now });

    try {
      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        status: 'paused',
        pauses
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
    const pauses = [...(todayRecord.pauses || [])];
    const lastPause = pauses[pauses.length - 1];
    if (lastPause && !lastPause.end) {
      lastPause.end = now;
    }

    try {
      await updateDoc(doc(db, 'attendance', todayRecord.id!), {
        status: 'working',
        pauses
      });
      toast.success("Resumed successfully.");
    } catch (error) {
      toast.error("Failed to resume. Please try again.");
      handleFirestoreError(error, OperationType.UPDATE, `attendance/${todayRecord.id}`);
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
                <button
                  onClick={handleCheckIn}
                  disabled={!!todayRecord?.checkIn}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                    todayRecord?.checkIn 
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                      : "bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg"
                  )}
                >
                  <CheckCircle className="w-5 h-5" />
                  {todayRecord?.checkIn ? t('emp.checked_in') : t('emp.check_in')}
                </button>

                <button
                  onClick={handleCheckOut}
                  disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut || todayRecord?.status === 'paused'}
                  className={cn(
                    "flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
                    (!todayRecord?.checkIn || !!todayRecord?.checkOut || todayRecord?.status === 'paused')
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                      : "bg-orange-600 text-white hover:bg-orange-700 shadow-md hover:shadow-lg"
                  )}
                >
                  <XCircle className="w-5 h-5" />
                  {todayRecord?.checkOut ? t('emp.checked_out') : t('emp.check_out')}
                </button>
              </div>

              {todayRecord?.checkIn && !todayRecord?.checkOut && (
                <div className="flex gap-4 w-full">
                  {todayRecord.status === 'working' ? (
                    <button
                      onClick={handlePause}
                      className="flex-1 py-3 px-4 rounded-lg font-medium bg-yellow-500 text-white hover:bg-yellow-600 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <Pause className="w-5 h-5" />
                      {formatStatus('paused')}
                    </button>
                  ) : todayRecord.status === 'paused' ? (
                    <button
                      onClick={handleResume}
                      className="flex-1 py-3 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <Play className="w-5 h-5" />
                      Resume
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          
          {todayRecord?.checkIn && (
            <div className="flex flex-col items-center gap-2">
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
                {todayRecord.checkIn && (
                  <span>{t('emp.check_in')}: {formatTime12h(todayRecord.checkIn.toDate())}</span>
                )}
                {todayRecord.checkOut && (
                  <span>{t('emp.check_out')}: {formatTime12h(todayRecord.checkOut.toDate())}</span>
                )}
              </div>
              {todayRecord.status === 'leave' && todayRecord.checkIn && todayRecord.checkOut && (
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
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
                {todayRecord?.checkIn 
                  ? formatDuration(calculateWorkingMinutes(
                      todayRecord.checkIn.toDate(), 
                      todayRecord.checkOut ? todayRecord.checkOut.toDate() : currentTime, 
                      todayRecord.pauses
                    ))
                  : todayRecord?.workingHours ? formatDuration(todayRecord.workingHours) : '-'}
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
                      const minutes = todayRecord.checkIn 
                        ? calculateWorkingMinutes(todayRecord.checkIn.toDate(), todayRecord.checkOut ? todayRecord.checkOut.toDate() : currentTime, todayRecord.pauses)
                        : todayRecord.workingHours || 0;
                      const rem = getRemainingOrOvertime(minutes);
                      return rem.type === 'remaining' ? rem.value : '0h 0m';
                    })()}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600 uppercase font-bold tracking-wider">{t('emp.overtime')}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {(() => {
                      const minutes = todayRecord.checkIn 
                        ? calculateWorkingMinutes(todayRecord.checkIn.toDate(), todayRecord.checkOut ? todayRecord.checkOut.toDate() : currentTime, todayRecord.pauses)
                        : todayRecord.workingHours || 0;
                      const rem = getRemainingOrOvertime(minutes);
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
                <th className="px-6 py-4">{t('emp.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{record.date}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record.checkIn ? formatTime12h(record.checkIn.toDate()) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record.checkOut ? formatTime12h(record.checkOut.toDate()) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record.checkIn && record.checkOut 
                      ? formatDuration(calculateWorkingMinutes(record.checkIn.toDate(), record.checkOut.toDate(), record.pauses))
                      : record.workingHours ? formatDuration(record.workingHours) : '-'}
                  </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium w-fit",
                          record.status === 'completed' || record.status === 'overtime' ? "bg-green-100 text-green-700" : 
                          record.status === 'working' ? "bg-blue-100 text-blue-700" :
                          record.status === 'paused' ? "bg-yellow-100 text-yellow-700" :
                          record.status === 'incomplete' ? "bg-orange-100 text-orange-700" :
                          record.status === 'leave' ? "bg-purple-100 text-purple-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {formatStatus(record.status)}
                        </span>
                        {record.status === 'leave' && record.checkIn && record.checkOut && (
                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tighter">
                            Conflict
                          </span>
                        )}
                      </div>
                    </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
