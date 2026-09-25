import { useState } from 'react';
import { Heart, Plus, CheckCircle, ArrowLeft, Loader2, Users } from 'lucide-react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { profileDoc } from '../lib/firebase.js';

const AuthAndPairing = ({ user, onGoogleLogin, onComplete }) => {
    const [stepState, setStep] = useState(user ? 'mode' : 'login');
    const [mode, setMode] = useState(null); 
    const [joinCode, setJoinCode] = useState('');
    const [role, setRole] = useState(null); 
    const [loading, setLoading] = useState(false);

    // 登入完成（user 出現）就直接進下一步，用推導的就好，不需要 effect 再 setState 一次
    const step = user && stepState === 'login' ? 'mode' : stepState;

    const handleSaveProfile = async () => {
        if (!role || (mode === 'join' && !joinCode)) return;
        setLoading(true);
        try {
            const coupleId = mode === 'create' ? user.uid : joinCode.trim();
            await setDoc(profileDoc(user.uid), {
                coupleId,
                role,
                email: user.email,
                name: user.displayName,
                avatar: user.photoURL,
                updatedAt: serverTimestamp()
            });
            onComplete({ coupleId, role });
        } catch (error) {
            console.error("Profile setup failed", error);
            alert("設定失敗，請重試");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-50 to-blue-50 p-6">
            <div className="bg-surface p-8 rounded-3xl shadow-xl w-full max-w-md relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none"><Heart size={120}/></div>
                <h1 className="text-2xl font-black text-gray-800 mb-2 flex items-center gap-2"><Heart className="text-pink-500" fill="currentColor" size={24}/> 我們的小金庫</h1>
                <p className="text-sm text-gray-500 mb-8 font-medium">情侶專屬的共同記帳與存錢空間</p>
                {step === 'login' && (
                    <div className="space-y-4 animate-[fadeIn_0.3s]">
                        <button onClick={onGoogleLogin} className="w-full py-4 bg-surface border-2 border-gray-100 hover:bg-gray-50 text-gray-800 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xs">
                            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            使用 Google 登入
                        </button>
                    </div>
                )}
                {step === 'mode' && (
                    <div className="space-y-4 animate-[fadeIn_0.3s]">
                        <h2 className="text-lg font-bold text-gray-700 mb-4">歡迎, {user?.displayName}！</h2>
                        <button onClick={() => { setMode('create'); setStep('role'); }} className="w-full py-4 bg-gray-900 text-surface rounded-2xl font-bold shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg"><Plus size={20}/> 建立專屬新空間</button>
                        <div className="flex items-center gap-4 my-2 opacity-50"><div className="flex-1 h-px bg-gray-300"></div><span className="text-xs font-bold">或者</span><div className="flex-1 h-px bg-gray-300"></div></div>
                        <button onClick={() => { setMode('join'); setStep('join'); }} className="w-full py-4 bg-surface border-2 border-gray-200 text-gray-700 rounded-2xl font-bold shadow-xs hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg"><Users size={20}/> 加入另一半的空間</button>
                    </div>
                )}
                {step === 'join' && (
                    <div className="space-y-4 animate-[fadeIn_0.3s]">
                        <button onClick={() => setStep('mode')} className="text-gray-400 mb-2 hover:text-gray-600"><ArrowLeft size={20}/></button>
                        <h2 className="text-lg font-bold text-gray-700 mb-2">請輸入配對碼</h2>
                        <p className="text-xs text-gray-500 mb-4">請另一半在他的「設定」頁面中複製配對碼給您。</p>
                        <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="貼上配對碼..." className="w-full bg-gray-50 p-4 rounded-xl border-2 border-transparent focus:border-purple-200 outline-hidden text-center font-bold tracking-wider"/>
                        <button disabled={!joinCode.trim()} onClick={() => setStep('role')} className="w-full py-4 mt-2 bg-purple-600 text-surface rounded-2xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-all">下一步</button>
                    </div>
                )}
                {step === 'role' && (
                    <div className="space-y-4 animate-[fadeIn_0.3s]">
                        <button onClick={() => setStep(mode === 'join' ? 'join' : 'mode')} className="text-gray-400 mb-2 hover:text-gray-600"><ArrowLeft size={20}/></button>
                        <h2 className="text-lg font-bold text-gray-700 mb-4">您是哪一位呢？</h2>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <button onClick={() => setRole('bf')} className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${role === 'bf' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-xs' : 'border-gray-100 bg-surface text-gray-400 hover:bg-gray-50'}`}><span className="text-4xl">👦</span><span className="font-bold">男朋友</span></button>
                            <button onClick={() => setRole('gf')} className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${role === 'gf' ? 'border-pink-500 bg-pink-50 text-pink-700 shadow-xs' : 'border-gray-100 bg-surface text-gray-400 hover:bg-gray-50'}`}><span className="text-4xl">👧</span><span className="font-bold">女朋友</span></button>
                        </div>
                        <button disabled={!role || loading} onClick={handleSaveProfile} className="w-full py-4 bg-gray-900 text-surface rounded-2xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={20}/> : <CheckCircle size={20}/>} 完成設定並開始使用</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthAndPairing;
