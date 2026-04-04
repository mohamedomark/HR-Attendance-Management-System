import React, { useState, useEffect } from 'react';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  handleFirestoreError, 
  OperationType,
  db
} from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { SystemSettings } from '../types';
import { Settings as SettingsIcon, Clock, ShieldCheck, Save, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const Settings: React.FC = () => {
  const { isAdmin } = useAuth();
  const { t, isRtl } = useLanguage();
  const [settings, setSettings] = useState<SystemSettings>({ 
    workStartTime: '09:00', 
    lateThresholdMinutes: 15,
    autoCheckOutTime: '23:59'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const settingsRef = doc(db, 'settings', 'global');
    
    console.log('Fetching settings from Firestore...');
    
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      if (!isMounted) return;
      
      clearTimeout(timeoutId);
      console.log('Settings fetched successfully:', snapshot.data());
      
      if (snapshot.exists()) {
        const data = snapshot.data() as SystemSettings;
        setSettings({
          workStartTime: data.workStartTime || '09:00',
          lateThresholdMinutes: data.lateThresholdMinutes || 15,
          autoCheckOutTime: data.autoCheckOutTime || '23:59'
        });
      } else {
        console.log('Settings document does not exist, using defaults.');
      }
      setLoading(false);
      setError(null);
    }, (err) => {
      if (!isMounted) return;
      clearTimeout(timeoutId);
      console.error('Error fetching settings:', err);
      setError('Failed to load settings. Please try again.');
      handleFirestoreError(err, OperationType.GET, 'settings/global');
      setLoading(false);
    });

    // 5-second timeout fallback
    timeoutId = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('Settings fetch timed out after 5 seconds. Using fallback defaults.');
        setError('Connection timed out. Using default settings.');
        setLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [isAdmin]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.settings')}</h2>
          <p className="text-sm text-gray-500">Configure system-wide attendance rules</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Attendance Rules
              </h3>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard Work Start Time</label>
                  <input
                    type="time"
                    value={settings.workStartTime}
                    onChange={(e) => setSettings({...settings, workStartTime: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Employees checking in after this time will be marked as 'Late'.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={settings.lateThresholdMinutes}
                    onChange={(e) => setSettings({...settings, lateThresholdMinutes: parseInt(e.target.value)})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Extra minutes allowed before marking as late.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auto Check-out Time</label>
                  <input
                    type="time"
                    value={settings.autoCheckOutTime}
                    onChange={(e) => setSettings({...settings, autoCheckOutTime: e.target.value})}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">System will automatically check out employees at this time if they haven't manually checked out.</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              {success && (
                <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  {t('common.success')}
                </p>
              )}
              <div className="flex-1" />
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-md disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-600 rounded-xl p-6 text-white shadow-lg">
            <h4 className="font-bold mb-2">System Info</h4>
            <p className="text-sm text-blue-100 mb-4">Current system time is synced with server time for accurate attendance tracking.</p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span>Version</span>
                <span>1.0.0</span>
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span>Environment</span>
                <span>Production</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-2">Audit Logs</h4>
            <p className="text-sm text-gray-500">All manual overrides and setting changes are logged for security purposes.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
