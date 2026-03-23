import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  doc, 
  addDoc, 
  Timestamp, 
  handleFirestoreError, 
  OperationType,
  db,
  where,
  deleteField
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AttendanceRecord, UserProfile, AttendanceStatus } from '../types';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { 
  Users, 
  Calendar, 
  Search, 
  Download, 
  Edit2, 
  Plus, 
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  History,
  Pause,
  Play,
  RotateCcw
} from 'lucide-react';
import { cn, formatTime12h, formatDuration, getRemainingOrOvertime, calculateWorkingMinutes } from '../lib/utils';
import { toast } from 'sonner';

const AdminDashboard: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { t, formatStatus, isRtl } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));

  // Modals
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<AttendanceStatus>('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const qAttendance = query(collection(db, 'attendance'), orderBy('date', 'desc'));
    const unsubscribeAttendance = onSnapshot(qAttendance, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[]);
      setLoading(false);
    });

    const qEmployees = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsubscribeEmployees = onSnapshot(qEmployees, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[]);
    });

    return () => {
      unsubscribeAttendance();
      unsubscribeEmployees();
    };
  }, [isAdmin]);

  const stats = useMemo(() => {
    const todayRecords = records.filter(r => r.date === format(new Date(), 'yyyy-MM-dd'));
    return {
      total: employees.length,
      working: todayRecords.filter(r => r.status === 'working').length,
      completed: todayRecords.filter(r => r.status === 'completed' || r.status === 'overtime').length,
      absent: employees.length - todayRecords.length
    };
  }, [records, employees]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const employee = employees.find(e => e.uid === record.uid);
      const matchesSearch = employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           employee?.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      
      let matchesDate = true;
      if (dateFilter) {
        matchesDate = record.date === dateFilter;
      } else if (monthFilter) {
        matchesDate = record.date.startsWith(monthFilter);
      }
      
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [records, employees, searchTerm, statusFilter, dateFilter, monthFilter]);

  const monthlyStats = useMemo(() => {
    if (dateFilter) return null;
    
    let totalWorkedMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalMissingMinutes = 0;
    let absentCount = 0;
    
    filteredRecords.forEach(r => {
      const minutes = r.checkIn 
        ? calculateWorkingMinutes(r.checkIn.toDate(), r.checkOut ? r.checkOut.toDate() : currentTime, r.pauses)
        : r.workingHours || 0;

      if (minutes > 0) {
        totalWorkedMinutes += minutes;
        if (minutes > 8 * 60) {
          totalOvertimeMinutes += (minutes - 8 * 60);
        } else if (minutes < 8 * 60) {
          totalMissingMinutes += (8 * 60 - minutes);
        }
      }
      if (r.status === 'absent') absentCount++;
    });
    
    return {
      totalWorked: formatDuration(totalWorkedMinutes),
      totalOvertime: formatDuration(totalOvertimeMinutes),
      totalMissing: formatDuration(totalMissingMinutes),
      absentCount
    };
  }, [filteredRecords, dateFilter, currentTime]);

  const handlePause = (record: AttendanceRecord) => {
    // Validation
    if (!record.checkIn) {
      toast.error("Cannot pause. Employee has not checked in.");
      return;
    }
    if (record.status === 'paused') {
      toast.error("Employee is already paused.");
      return;
    }
    if (record.status !== 'working') {
      toast.error("Pause is only allowed when employee is working.");
      return;
    }

    setConfirmAction({
      title: "Pause Employee",
      message: "Are you sure you want to pause this employee's work?",
      onConfirm: async () => {
        if (!user) return;
        
        const now = Timestamp.now();
        const pauses = [...(record.pauses || [])];
        pauses.push({ start: now });
        
        try {
          await updateDoc(doc(db, 'attendance', record.id!), {
            status: 'paused',
            pauses
          });
          toast.success("Employee paused successfully.");
        } catch (error) {
          toast.error("Something went wrong. Please try again.");
          handleFirestoreError(error, OperationType.UPDATE, `attendance/${record.id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleResume = (record: AttendanceRecord) => {
    // Validation
    if (record.status !== 'paused') {
      toast.error("Resume is only allowed when employee is paused.");
      return;
    }

    setConfirmAction({
      title: "Resume Employee",
      message: "Are you sure you want to resume this employee's work?",
      onConfirm: async () => {
        if (!user) return;
        
        const now = Timestamp.now();
        const pauses = [...(record.pauses || [])];
        const lastPause = pauses[pauses.length - 1];
        if (lastPause && !lastPause.end) {
          lastPause.end = now;
        }
        
        try {
          await updateDoc(doc(db, 'attendance', record.id!), {
            status: 'working',
            pauses
          });
          toast.success("Employee resumed successfully.");
        } catch (error) {
          toast.error("Failed to resume. Please try again.");
          handleFirestoreError(error, OperationType.UPDATE, `attendance/${record.id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleReset = (record: AttendanceRecord) => {
    setConfirmAction({
      title: "Reset Attendance",
      message: "Are you sure you want to reset this employee's attendance for today?",
      onConfirm: async () => {
        if (!user) return;
        
        try {
          await deleteDoc(doc(db, 'attendance', record.id!));
          toast.success("Attendance has been reset successfully.");
        } catch (error) {
          toast.error("Something went wrong. Please try again.");
          handleFirestoreError(error, OperationType.DELETE, `attendance/${record.id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const handleOverride = async () => {
    if (!selectedRecord || !user) return;

    setConfirmAction({
      title: "Change Status",
      message: `Are you sure you want to change the employee status to '${formatStatus(overrideStatus)}'?`,
      onConfirm: async () => {
        const updates: any = {
          status: overrideStatus,
          manualOverride: true,
          overrideReason,
          updatedBy: user.uid
        };

        const now = Timestamp.now();

        // Smart Transitions & Full Recalculation Logic
        if (overrideStatus === 'working') {
          if (!selectedRecord.checkIn) {
            updates.checkIn = now;
          }
          // If resuming from pause
          if (selectedRecord.status === 'paused') {
            const pauses = [...(selectedRecord.pauses || [])];
            const lastPause = pauses[pauses.length - 1];
            if (lastPause && !lastPause.end) {
              lastPause.end = now;
              updates.pauses = pauses;
            }
          }
          // Ensure checkOut is cleared if moving back to working
          updates.checkOut = deleteField();
          updates.workingHours = deleteField();
          updates.remainingHours = deleteField();
          updates.overtimeHours = deleteField();
        } 
        else if (overrideStatus === 'paused') {
          if (!selectedRecord.checkIn) {
            updates.checkIn = now; // Can't pause without check-in, so create one
          }
          if (selectedRecord.status === 'working') {
            const pauses = [...(selectedRecord.pauses || [])];
            pauses.push({ start: now });
            updates.pauses = pauses;
          }
        }
        else if (overrideStatus === 'completed' || overrideStatus === 'overtime' || overrideStatus === 'incomplete') {
          if (!selectedRecord.checkIn) {
            updates.checkIn = now; // Simulate full session if missing
          }
          if (!selectedRecord.checkOut) {
            updates.checkOut = now;
          }
          
          // Calculate working hours for the final state
          const checkIn = updates.checkIn || selectedRecord.checkIn;
          const checkOut = updates.checkOut || selectedRecord.checkOut;
          const pauses = updates.pauses || selectedRecord.pauses;
          
          if (checkIn && checkOut) {
            const minutes = calculateWorkingMinutes(checkIn.toDate(), checkOut.toDate(), pauses);
            updates.workingHours = minutes;
            
            const requiredMinutes = 8 * 60;
            if (minutes > requiredMinutes) {
              updates.overtimeHours = minutes - requiredMinutes;
              updates.remainingHours = 0;
            } else {
              updates.remainingHours = requiredMinutes - minutes;
              updates.overtimeHours = 0;
            }
          }
        }
        else if (overrideStatus === 'absent') {
          updates.checkIn = deleteField();
          updates.checkOut = deleteField();
          updates.workingHours = 0;
          updates.remainingHours = 0;
          updates.overtimeHours = 0;
          updates.pauses = deleteField();
        }

        try {
          await updateDoc(doc(db, 'attendance', selectedRecord.id!), updates);
          setIsOverrideModalOpen(false);
          setSelectedRecord(null);
          setOverrideReason('');
          toast.success("Status updated successfully.");
        } catch (error) {
          toast.error("Something went wrong. Please try again.");
          handleFirestoreError(error, OperationType.UPDATE, `attendance/${selectedRecord.id}`);
        }
      }
    });
    setIsConfirmModalOpen(true);
  };

  const exportToCSV = () => {
    const headers = ['Employee', 'ID', 'Date', 'Check In', 'Check Out', 'Status', 'Hours'];
    const rows = filteredRecords.map(r => {
        const emp = employees.find(e => e.uid === r.uid);
        const minutes = r.checkIn 
          ? calculateWorkingMinutes(r.checkIn.toDate(), r.checkOut ? r.checkOut.toDate() : currentTime, r.pauses)
          : r.workingHours || 0;
        const remOver = minutes > 0 ? getRemainingOrOvertime(minutes) : { type: 'none', value: '-' };
        return [
          emp?.name || 'Unknown',
          emp?.employeeId || '-',
          r.date,
          r.checkIn ? formatTime12h(r.checkIn.toDate()) : '-',
          r.checkOut ? formatTime12h(r.checkOut.toDate()) : '-',
          formatStatus(r.status),
          minutes > 0 ? formatDuration(minutes) : '-',
          remOver.type === 'remaining' ? remOver.value : '-',
          remOver.type === 'overtime' ? remOver.value : '-'
        ];
      });
  
      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `attendance_report_${dateFilter || monthFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t('hr.total_employees')} value={stats.total} icon={Users} color="blue" />
        <StatCard title={t('hr.present_today')} value={stats.working} icon={Clock} color="blue" />
        <StatCard title={t('hr.late_today')} value={stats.completed} icon={CheckCircle} color="green" />
        <StatCard title={t('hr.absent_today')} value={stats.absent} icon={XCircle} color="red" />
      </div>

      {/* Monthly Summary (Only when viewing by month) */}
      {monthlyStats && !dateFilter && (
        <div className="bg-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5" />
            <h3 className="text-lg font-bold">Monthly Summary: {format(new Date(monthFilter + '-01'), 'MMMM yyyy')}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-blue-100 text-xs uppercase font-bold tracking-wider">Total Worked</p>
              <p className="text-2xl font-bold">{monthlyStats.totalWorked}</p>
            </div>
            <div className="space-y-1">
              <p className="text-blue-100 text-xs uppercase font-bold tracking-wider">Total Overtime</p>
              <p className="text-2xl font-bold">{monthlyStats.totalOvertime}</p>
            </div>
            <div className="space-y-1">
              <p className="text-blue-100 text-xs uppercase font-bold tracking-wider">Total Missing</p>
              <p className="text-2xl font-bold">{monthlyStats.totalMissing}</p>
            </div>
            <div className="space-y-1">
              <p className="text-blue-100 text-xs uppercase font-bold tracking-wider">Absent Days</p>
              <p className="text-2xl font-bold">{monthlyStats.absentCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('hr.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setDateFilter('');
                }}
                className="bg-transparent text-sm outline-none"
              />
            </div>

            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  if (e.target.value) setMonthFilter(format(new Date(e.target.value), 'yyyy-MM'));
                }}
                className="bg-transparent text-sm outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none"
            >
              <option value="all">{t('hr.filter_status')}</option>
              <option value="completed">{formatStatus('completed')}</option>
              <option value="incomplete">{formatStatus('incomplete')}</option>
              <option value="overtime">{formatStatus('overtime')}</option>
              <option value="working">{formatStatus('working')}</option>
              <option value="absent">{formatStatus('absent')}</option>
              <option value="leave">{formatStatus('leave')}</option>
            </select>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              {t('hr.export')}
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-4">{t('common.name')}</th>
                <th className="px-6 py-4">{t('emp.date')}</th>
                <th className="px-6 py-4">{t('emp.check_in')}</th>
                <th className="px-6 py-4">{t('emp.check_out')}</th>
                <th className="px-6 py-4">{t('emp.hours')}</th>
                <th className="px-6 py-4">{t('emp.remaining')}</th>
                <th className="px-6 py-4">{t('emp.overtime')}</th>
                <th className="px-6 py-4">{t('emp.status')}</th>
                <th className="px-6 py-4">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map((record) => {
                const emp = employees.find(e => e.uid === record.uid);
                const minutes = record.checkIn 
                  ? calculateWorkingMinutes(record.checkIn.toDate(), record.checkOut ? record.checkOut.toDate() : currentTime, record.pauses)
                  : record.workingHours || 0;
                const remOver = minutes > 0 ? getRemainingOrOvertime(minutes) : { type: 'none', value: '-' };
                
                return (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{emp?.name || 'Unknown'}</span>
                        <span className="text-xs text-gray-500">{emp?.employeeId || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {record.checkIn ? formatTime12h(record.checkIn.toDate()) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {record.checkOut ? formatTime12h(record.checkOut.toDate()) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {minutes > 0 ? formatDuration(minutes) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-orange-600 font-medium">
                      {remOver.type === 'remaining' ? remOver.value : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-green-600 font-medium">
                      {remOver.type === 'overtime' ? remOver.value : '-'}
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
                          <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">
                            Conflict
                          </span>
                        )}
                        {record.manualOverride && (
                          <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">
                            {t('common.override')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {record.status === 'working' && (
                          <button
                            onClick={() => handlePause(record)}
                            className="p-2 text-gray-400 hover:text-yellow-600 transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {record.status === 'paused' && (
                          <button
                            onClick={() => handleResume(record)}
                            className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                            title="Resume"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleReset(record)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Reset"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRecord(record);
                            setOverrideStatus(record.status);
                            setIsOverrideModalOpen(true);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-6">
            <h3 className="text-xl font-bold">{t('hr.edit_record')}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('emp.status')}</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as AttendanceStatus)}
                  className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="completed">{formatStatus('completed')}</option>
                  <option value="incomplete">{formatStatus('incomplete')}</option>
                  <option value="overtime">{formatStatus('overtime')}</option>
                  <option value="working">{formatStatus('working')}</option>
                  <option value="paused">{formatStatus('paused')}</option>
                  <option value="absent">{formatStatus('absent')}</option>
                  <option value="leave">{formatStatus('leave')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.reason')}</label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                  placeholder="Reason for manual override..."
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleOverride}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmModalOpen && confirmAction && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-orange-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-xl font-bold">{confirmAction.title}</h3>
            </div>
            <p className="text-gray-600">{confirmAction.message}</p>
            
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmAction(null);
                }}
                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  const onConfirm = confirmAction.onConfirm;
                  setIsConfirmModalOpen(false);
                  setConfirmAction(null);
                  await onConfirm();
                }}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600"
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={cn("p-3 rounded-lg", colors[color])}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
};

export default AdminDashboard;
