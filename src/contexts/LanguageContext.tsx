import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../types';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  formatStatus: (status: string) => string;
  isRtl: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    'app.title': 'ABG Egypt Attendance Management',
    'nav.dashboard': 'Dashboard',
    'nav.employees': 'Employees',
    'nav.attendance': 'Attendance',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'auth.login': 'Login',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.remember': 'Remember Me',
    'auth.signing_in': 'Signing in...',
    'auth.error': 'Invalid email or password',
    'emp.check_in': 'Check In',
    'emp.check_out': 'Check Out',
    'emp.checked_in': 'Checked In',
    'emp.checked_out': 'Checked Out',
    'emp.already_checked_in': 'Already checked in today',
    'emp.already_checked_out': 'Already checked out today',
    'emp.history': 'Attendance History',
    'emp.status': 'Status',
    'emp.date': 'Date',
    'emp.time': 'Time',
    'emp.hours': 'Hours',
    'emp.remaining': 'Remaining',
    'emp.overtime': 'Overtime',
    'emp.pause': 'Pause',
    'emp.resume': 'Resume',
    'hr.overview': 'Overview',
    'hr.total_employees': 'Total Employees',
    'hr.present_today': 'Working Today',
    'hr.late_today': 'Completed Today',
    'hr.absent_today': 'Absent Today',
    'hr.all_logs': 'All Attendance Logs',
    'hr.add_employee': 'Add Employee',
    'hr.edit_record': 'Edit Record',
    'hr.manual_entry': 'Manual Entry',
    'hr.search': 'Search employees...',
    'hr.filter_date': 'Filter by Date',
    'hr.filter_status': 'Filter by Status',
    'hr.export': 'Export CSV',
    'status.absent': 'Absent',
    'status.working': 'Working',
    'status.completed': 'Completed',
    'status.incomplete': 'Incomplete',
    'status.overtime': 'Overtime',
    'status.leave': 'On Leave',
    'status.paused': 'Paused',
    'status.auto-completed': 'Auto Completed',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.name': 'Name',
    'common.position': 'Position',
    'common.employee_id': 'Employee ID',
    'common.actions': 'Actions',
    'common.loading': 'Loading...',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.reason': 'Reason',
    'common.override': 'Manual Override',
  },
  ar: {
    'app.title': 'إدارة حضور وانصراف ABG Egypt',
    'nav.dashboard': 'لوحة التحكم',
    'nav.employees': 'الموظفين',
    'nav.attendance': 'الحضور',
    'nav.settings': 'الإعدادات',
    'nav.logout': 'تسجيل الخروج',
    'auth.login': 'تسجيل الدخول',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.remember': 'تذكرني',
    'auth.signing_in': 'جاري تسجيل الدخول...',
    'auth.error': 'البريد الإلكتروني أو كلمة المرور غير صالحة',
    'emp.check_in': 'تسجيل حضور',
    'emp.check_out': 'تسجيل انصراف',
    'emp.checked_in': 'تم تسجيل الحضور',
    'emp.checked_out': 'تم تسجيل الانصراف',
    'emp.already_checked_in': 'تم تسجيل الحضور بالفعل اليوم',
    'emp.already_checked_out': 'تم تسجيل الانصراف بالفعل اليوم',
    'emp.history': 'سجل الحضور',
    'emp.status': 'الحالة',
    'emp.date': 'التاريخ',
    'emp.time': 'الوقت',
    'emp.hours': 'الساعات',
    'emp.remaining': 'المتبقي',
    'emp.overtime': 'الوقت الإضافي',
    'emp.pause': 'إيقاف مؤقت',
    'emp.resume': 'استئناف',
    'hr.overview': 'نظرة عامة',
    'hr.total_employees': 'إجمالي الموظفين',
    'hr.present_today': 'يعملون اليوم',
    'hr.late_today': 'أكملوا اليوم',
    'hr.absent_today': 'غائبون اليوم',
    'hr.all_logs': 'جميع سجلات الحضور',
    'hr.add_employee': 'إضافة موظف',
    'hr.edit_record': 'تعديل السجل',
    'hr.manual_entry': 'إدخال يدوي',
    'hr.search': 'البحث عن موظفين...',
    'hr.filter_date': 'تصفية حسب التاريخ',
    'hr.filter_status': 'تصفية حسب الحالة',
    'hr.export': 'تصدير CSV',
    'status.absent': 'غائب',
    'status.working': 'يعمل',
    'status.completed': 'مكتمل',
    'status.incomplete': 'غير مكتمل',
    'status.overtime': 'وقت إضافي',
    'status.leave': 'إجازة',
    'status.paused': 'متوقف مؤقتاً',
    'status.auto-completed': 'مكتمل تلقائياً',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.edit': 'تعديل',
    'common.delete': 'حذف',
    'common.name': 'الاسم',
    'common.position': 'المنصب',
    'common.employee_id': 'رقم الموظف',
    'common.actions': 'الإجراءات',
    'common.loading': 'جاري التحميل...',
    'common.success': 'نجاح',
    'common.error': 'خطأ',
    'common.reason': 'السبب',
    'common.override': 'تعديل يدوي',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('language') as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  const formatStatus = (status: string | undefined | null) => {
    if (!status) return language === 'ar' ? 'حالة غير معروفة' : 'Unknown Status';
    const key = `status.${status}`;
    const translated = translations[language][key];
    if (translated) return translated;
    
    // Fallback for unknown status
    return language === 'ar' ? 'حالة غير معروفة' : 'Unknown Status';
  };

  const isRtl = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatStatus, isRtl }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
