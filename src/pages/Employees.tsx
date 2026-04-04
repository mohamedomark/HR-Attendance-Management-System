import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  setDoc, 
  doc, 
  addDoc,
  handleFirestoreError, 
  OperationType,
  db,
  where,
  Timestamp
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { UserProfile, UserRole } from '../types';
import { 
  Users, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  UserPlus,
  Mail,
  Briefcase,
  IdCard,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

import { initializeApp } from 'firebase/app';
import { 
  createUserWithEmailAndPassword, 
  getAuth, 
  signOut 
} from 'firebase/auth';
import { firebaseConfig } from '../firebase';

const Employees: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { t, isRtl } = useLanguage();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee' as UserRole,
    position: '',
    employeeId: '',
    managerId: ''
  });

  useEffect(() => {
    if (!isAdmin) return;

    const qAll = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(qAll, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);

    try {
      if (editingEmployee) {
        // Update existing
        await setDoc(doc(db, 'users', editingEmployee.uid), {
          ...editingEmployee,
          name: formData.name,
          role: formData.role,
          position: formData.position,
          employeeId: formData.employeeId,
          managerId: formData.managerId || null
        });
      } else {
        // Create new Auth User using secondary instance to avoid logging out admin
        const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth, 
            formData.email, 
            formData.password || 'TempPass123!'
          );
          const user = userCredential.user;

          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: formData.name,
            email: formData.email,
            role: formData.role,
            position: formData.position,
            employeeId: formData.employeeId,
            managerId: formData.managerId || null,
            isDeleted: false,
            createdAt: Timestamp.now()
          });

          // Sign out from secondary instance immediately
          await signOut(secondaryAuth);
        } catch (authErr: any) {
          if (authErr.code === 'auth/operation-not-allowed') {
            throw new Error('Email/Password provider is disabled in Firebase Console. Please enable it in Authentication > Sign-in method.');
          }
          throw authErr;
        }
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save employee');
      console.error(err);
    }
  };

  const handleDelete = async (employee: UserProfile) => {
    if (!isAdmin || !user) return;
    
    const confirmDelete = window.confirm(`Are you sure you want to delete ${employee.name}? This will mark them as deleted but keep their records.`);
    if (!confirmDelete) return;

    try {
      await setDoc(doc(db, 'users', employee.uid), {
        ...employee,
        isDeleted: true
      });
      
      // Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        actorId: user.uid,
        actorName: user.displayName || 'Admin',
        employeeId: employee.uid,
        employeeName: employee.name,
        action: 'delete',
        details: 'Soft deleted employee account',
        timestamp: Timestamp.now()
      });

      toast.success("Employee deleted successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete employee");
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'employee',
      position: '',
      employeeId: '',
      managerId: ''
    });
    setEditingEmployee(null);
  };

  const filteredEmployees = employees.filter(emp => 
    !emp.isDeleted && (
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeId?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const managers = employees.filter(emp => emp.role === 'manager' && !emp.isDeleted);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('nav.employees')}</h2>
            <p className="text-sm text-gray-500">{employees.length} {t('hr.total_employees')}</p>
          </div>
        </div>

        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-md hover:shadow-lg"
        >
          <UserPlus className="w-5 h-5" />
          {t('hr.add_employee')}
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('hr.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((emp) => (
          <div key={emp.uid} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow group">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xl">
                {emp.name.charAt(0)}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setEditingEmployee(emp);
                    setFormData({
                      name: emp.name,
                      email: emp.email,
                      password: '',
                      role: emp.role,
                      position: emp.position || '',
                      employeeId: emp.employeeId || '',
                      managerId: emp.managerId || ''
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(emp)}
                  className="p-2 text-gray-400 hover:text-red-600 bg-gray-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-gray-900">{emp.name}</h3>
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">{emp.role}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  {emp.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Briefcase className="w-4 h-4" />
                  {emp.position || '-'}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <IdCard className="w-4 h-4" />
                  {emp.employeeId || '-'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-8 overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-bold mb-6">{editingEmployee ? t('common.edit') : t('hr.add_employee')}</h3>
            
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')}</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
                  <input
                    required
                    type="email"
                    disabled={!!editingEmployee}
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                </div>

                {!editingEmployee && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
                    <input
                      required
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Min 6 chars"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.employee_id')}</label>
                  <input
                    value={formData.employeeId}
                    onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.position')}</label>
                  <input
                    value={formData.position}
                    onChange={(e) => setFormData({...formData, position: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('emp.status')}</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr-admin">HR Admin</option>
                  </select>
                  {(formData.position.toLowerCase() === 'po' || formData.position.toLowerCase() === 'product owner' || formData.position.toLowerCase() === 'product owner (po)') && (
                    <p className="mt-1.5 text-xs text-blue-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      PO users will automatically have admin-level access
                    </p>
                  )}
                </div>

                {formData.role === 'employee' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                    <select
                      value={formData.managerId}
                      onChange={(e) => setFormData({...formData, managerId: e.target.value})}
                      className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No Manager</option>
                      {managers.map(m => (
                        <option key={m.uid} value={m.uid}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-md"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
